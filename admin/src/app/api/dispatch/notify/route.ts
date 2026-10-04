import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendRiderPush } from "@/lib/server/push-notify";

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
 * Earnings tab when work lands has already lost it. So the alert is sent from
 * the admin side, right after the offers land, which is the same shape as
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

/** Resolve the caller and require the admin role. Same shape as /api/orders/notify. */
async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { error: "Unauthorized", status: 401 } as const;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey)
    return { error: "not configured", status: 500 } as const;

  const caller = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await caller.auth.getUser(token);
  if (!user) return { error: "Unauthorized", status: 401 } as const;

  const supabase = serviceClient();
  if (!supabase) return { error: "not configured", status: 500 } as const;

  const { data: row } = await supabase
    .from("app_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (row?.role !== "admin")
    return { error: "Admins only", status: 403 } as const;

  return { supabase, user } as const;
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { supabase } = auth;

  const body = (await req.json().catch(() => ({}))) as Body;
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  if (!orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  // Service role, so these rows are visible regardless of RLS. Admin-only was
  // established above, and the caller supplied the order id, so there is no
  // unscoped read to abuse here.
  const { data: offers, error: offersError } = await supabase
    .from("order_offers")
    .select("offered_at, expires_at, riders!inner(user_id)")
    .eq("order_id", orderId)
    .eq("status", "offered");

  if (offersError) {
    return NextResponse.json({ error: offersError.message }, { status: 500 });
  }

  const { data: order } = await supabase
    .from("orders")
    .select("reference, restaurant")
    .eq("id", orderId)
    .maybeSingle();

  const rows = offers ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ notified: 0, skipped: "no live offers" });
  }

  const reference = order?.reference ?? orderId;

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
        { orderId },
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
