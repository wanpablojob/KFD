import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendRiderPush } from "@/lib/server/push-notify";

/**
 * POST /api/push/rider
 *
 * Pushes one alert to the rider who owns an order. Called by the rider app
 * right after `rider_mark_delivered` succeeds, on their own device.
 *
 * Requires a signed-in caller: `Authorization: Bearer <supabase access token>`.
 * Body: { "orderId": string }
 *
 * Why the rider app calls this rather than a database trigger doing it:
 * `rider_mark_delivered` is a Postgres function, and reaching this route from
 * there means pg_net plus a vault-held bearer -- real infrastructure to verify,
 * for an alert that only matters while the app is open anyway. The rider who
 * just tapped "mark delivered" is on their phone, so the client already knows
 * the right moment. If this ever needs to fire without the app open, that is
 * the point to add pg_net, not before.
 *
 * The caller must be the rider assigned to the order. `orders` is read with the
 * service role, which bypasses RLS, so without that check any signed-in user
 * could pass an arbitrary order id and have a push sent to another rider.
 *
 * Best-effort by contract: the delivery is already recorded, so every failure
 * path here returns 200 with a reason rather than an error the client would
 * retry. The app does not await this.
 */

export const runtime = "nodejs";

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

export async function POST(req: Request) {
  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ skipped: "server is not configured" });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ skipped: "server is missing Supabase configuration" });
  }

  // Verify the token rather than trusting the body: this route signs a device
  // up for a message about someone else's order.
  const caller = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await caller.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  if (!orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, reference, rider_id, rider_payout, status, riders!inner(user_id)")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ skipped: "order not found" });
  }

  // Service role bypassed RLS, so the caller's identity is the only thing
  // scoping this. Compare against the assigned rider's auth user.
  const rider = order.riders as unknown as { user_id: string | null } | null;
  if (!rider?.user_id || rider.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payout = Number(order.rider_payout ?? 0);
  const result = await sendRiderPush(
    supabase,
    user.id,
    "Delivery completed",
    payout > 0
      ? `Order ${order.reference} is delivered. You earned ₱${payout.toFixed(2)}.`
      : `Order ${order.reference} is delivered.`,
    { orderId: order.id, reference: order.reference }
  );

  // Always 200: the push is a courtesy on top of a write that already landed.
  return NextResponse.json(result);
}