import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendRiderPush, OFFERS_CHANNEL_ID } from "@/lib/server/push-notify";
import { reportServerError } from "@/lib/server/report-error";
import { checkRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/dispatch/notify
 *
 * Tells riders that an offer just went out.
 *
 * Why this exists: offers are created by admin_dispatch_order(), a Postgres
 * function, and a Postgres function cannot call a Next.js route. Without this,
 * the only way a rider learns there is work waiting is to have the Available tab
 * open and poll it -- and an offer lives 5 minutes. A rider who is on the
 * Earnings tab when work lands has already lost it. So the alert is sent right
 * after the offers land: by the merchant portal when a restaurant accepts
 * (auto-dispatch, 0085) and by an admin on re-offer. Same shape as
 * /api/orders/notify: a courtesy on top of a write that already succeeded.
 *
 * Best-effort by contract. The offers are already live whether or not this
 * succeeds, so a push failure is reported in the response body but never turned
 * into an error the dispatcher has to handle.
 */

interface Body {
  orderId?: string;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Deliberately NOT NEXT_PUBLIC_*: bypasses RLS, must never reach a bundle.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Resolve the caller and their role. Admins may alert for any order; a merchant
 * only for an order of their own restaurant, which POST checks once it has
 * read the order.
 */
async function resolveCaller(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { error: "Unauthorized", status: 401 } as const;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) {
    reportServerError(new Error("Supabase URL or key not configured"), "dispatch/notify");
    return { error: "not configured", status: 500 } as const;
  }

  const caller = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await caller.auth.getUser(token);
  if (!user) return { error: "Unauthorized", status: 401 } as const;

  const supabase = serviceClient();
  if (!supabase) {
    reportServerError(new Error("Service role client not configured"), "dispatch/notify");
    return { error: "not configured", status: 500 } as const;
  }

  const { data: row } = await supabase
    .from("app_users")
    .select("role, restaurant_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (row?.role !== "admin" && row?.role !== "merchant")
    return { error: "Admins and merchants only", status: 403 } as const;

  return {
    supabase,
    user,
    isAdmin: row.role === "admin",
    restaurantId: row.restaurant_id as string | null,
  } as const;
}

export async function POST(req: Request) {
  const auth = await resolveCaller(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { supabase } = auth;

  // Re-offering is a legitimate repeat action, so the ceiling is generous; it
  // exists to stop a scripted caller turning the route into a push cannon
  // pointed at every rider in the zone. Keyed by the verified user, never the
  // order id in the body.
  const limited = checkRateLimit(`dispatch-notify:${auth.user.id}`, 20, 60_000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many dispatch alerts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  // A whole trip (0092): the offers live on the trip, not on a shop's order.
  const deliveryId =
    typeof (body as { deliveryId?: unknown }).deliveryId === "string"
      ? ((body as { deliveryId?: string }).deliveryId ?? "").trim()
      : "";
  if (!orderId && !deliveryId) {
    return NextResponse.json(
      { error: "orderId or deliveryId is required" },
      { status: 400 },
    );
  }

  // A trip is the dispatcher's business; a merchant's own order is theirs.
  if (deliveryId && !auth.isAdmin) {
    return NextResponse.json(
      { error: "Admins only for a delivery" },
      { status: 403 },
    );
  }

  // Service role, so these rows are visible regardless of RLS. Nothing from
  // them is returned before the ownership check below; the caller only ever
  // learns counts for an order they are allowed to dispatch.
  const { data: offers, error: offersError } = await supabase
    .from(deliveryId ? "delivery_offers" : "order_offers")
    .select("offered_at, expires_at, riders!inner(user_id)")
    .eq(deliveryId ? "delivery_id" : "order_id", deliveryId || orderId)
    .eq("status", "offered");

  if (offersError) {
    reportServerError(offersError, "dispatch/notify");
    return NextResponse.json({ error: offersError.message }, { status: 500 });
  }

  const { data: order } = await supabase
    .from("orders")
    .select("reference, restaurant, restaurant_id, delivery_id")
    .eq("id", orderId)
    .maybeSingle();

  const { data: trip } = deliveryId
    ? await supabase
        .from("deliveries")
        .select("id, reference, shops")
        .eq("id", deliveryId)
        .maybeSingle()
    : { data: null };

  // A merchant may only alert riders about their own restaurant's order, so a
  // merchant account cannot spam riders with pushes for orders it does not own.
  if (!auth.isAdmin && (!order || !auth.restaurantId || order.restaurant_id !== auth.restaurantId)) {
    return NextResponse.json({ error: "Not your order" }, { status: 403 });
  }

  let rows = offers ?? [];

  // A part of a trip (0092) is dispatched as the trip: its offers live on the
  // trip, not on the shop's order. Reading only order_offers here meant the
  // riders were never told about a basket of several shops.
  let tripId: string | null = deliveryId || null;
  let reference = trip?.reference ?? order?.reference ?? orderId;

  if (order?.delivery_id) {
    const { data: trip } = await supabase
      .from("deliveries")
      .select("id, reference, shops")
      .eq("id", order.delivery_id)
      .maybeSingle();

    if (trip) {
      tripId = trip.id;
      reference = trip.reference;
      const { data: tripOffers } = await supabase
        .from("delivery_offers")
        .select("offered_at, expires_at, riders!inner(user_id)")
        .eq("delivery_id", trip.id)
        .eq("status", "offered");
      rows = tripOffers ?? [];
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ notified: 0, skipped: "no live offers" });
  }

  // The window is read back off the rows rather than restated as "5 minutes".
  // The dispatch board used to hardcode that sentence in two places, which is a
  // second source of truth for a number admin_dispatch_order owns; retune the
  // interval there and both sentences would start lying.
  const windows = rows
    .map(
      (o) =>
        new Date(o.expires_at).getTime() - new Date(o.offered_at).getTime(),
    )
    .filter((ms) => Number.isFinite(ms) && ms > 0);
  const windowSeconds =
    windows.length > 0 && windows.every((ms) => ms === windows[0])
      ? Math.round(windows[0] / 1000)
      : null;

  const recipients = rows
    .map(
      (o) =>
        (o.riders as unknown as { user_id: string | null } | null)?.user_id,
    )
    .filter((id): id is string => Boolean(id));

  const results = await Promise.all(
    recipients.map((userId) =>
      sendRiderPush(
        supabase,
        userId,
        "New delivery offer",
        `Order ${reference} is available${windowSeconds ? ` for ${Math.round(windowSeconds / 60)} min` : ""}. Open the app to accept it.`,
        // A trip is accepted as a trip; a single order as a single order.
        tripId
          ? { type: "dispatch_offer", deliveryId: tripId, reference }
          : { type: "dispatch_offer", orderId },
        // Its own channel: an offer expires in minutes and is worth chasing, which
        // is not true of order-status news sharing the same channel.
        OFFERS_CHANNEL_ID,
      ),
    ),
  );

  const sent = results.filter((r) => r.sent > 0).length;

  // Always 200. The offers are already live; a push failure is not the
  // dispatcher's problem and must not read as a failed dispatch.
  return NextResponse.json({
    notified: sent,
    recipients: recipients.length,
    windowSeconds,
  });
}
