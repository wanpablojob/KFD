import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  newOrderEmail,
  orderStatusEmail,
  sendOrderEmail,
  type OrderEmailData,
} from "@/lib/server/order-email";

/**
 * POST /api/orders/notify
 *
 * Sends order email. Called by the merchant portal when it accepts or rejects
 * an order, and by the (future) customer app when an order is placed.
 *
 * Requires a signed-in caller: `Authorization: Bearer <supabase access token>`.
 * The token is verified, not trusted, because this endpoint sends email on
 * behalf of the platform. The caller must also be an admin, or the merchant
 * attached to the order's restaurant.
 *
 * Body:
 *   { orderId: string, event: "placed" | "status_changed", reason?: string }
 *
 * Recipients:
 *   placed          -> every merchant user attached to the order's restaurant
 *   status_changed  -> the customer on the order
 *
 * Note: `placed` is not callable by a customer yet, because orders has no
 * link back to a customer account. When the customer app lands, place the
 * insert and the notification in one server-side call rather than opening
 * this to unverified callers.
 */

interface NotifyBody {
  orderId?: string;
  event?: "placed" | "status_changed";
  reason?: string;
}

export const runtime = "nodejs";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Deliberately NOT NEXT_PUBLIC_*: this key bypasses RLS and must never be
  // inlined into a browser bundle.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as NotifyBody;
  const { orderId, event, reason } = body;

  if (!orderId || !event) {
    return NextResponse.json(
      { error: "orderId and event are required" },
      { status: 400 }
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const supabase = serviceClient();

  if (!url || !anonKey || !supabase) {
    return NextResponse.json(
      { error: "Server is missing Supabase configuration" },
      { status: 500 }
    );
  }

  // Verify the caller with the anon client, which honours the JWT.
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

  // Read the order with the service role: the caller may be a customer, who
  // has no RLS access to orders at all.
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // The service role bypasses RLS, so the order read above is unscoped by
  // design. That makes the caller's own access the only thing standing between
  // a signed-in merchant and another restaurant's order, so re-check it here:
  // without this, any authenticated user could probe order ids and trigger
  // emails to another restaurant's customers.
  const { data: callerRow } = await supabase
    .from("app_users")
    .select("role, restaurant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = callerRow?.role === "admin";
  const isOwnRestaurant =
    callerRow?.role === "merchant" &&
    !!order.restaurant_id &&
    order.restaurant_id === callerRow.restaurant_id;

  if (!isAdmin && !isOwnRestaurant) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const emailData: OrderEmailData = {
    reference: order.reference,
    restaurant: order.restaurant,
    customer: order.customer,
    items: Array.isArray(order.items) ? order.items : [],
    total: Number(order.total),
  };

  if (event === "placed") {
    if (!order.restaurant_id) {
      return NextResponse.json(
        { skipped: "order has no restaurant_id" },
        { status: 202 }
      );
    }

    const { data: merchantRows } = await supabase
      .from("app_users")
      .select("user_id")
      .eq("restaurant_id", order.restaurant_id)
      .eq("role", "merchant");

    const userIds = (merchantRows ?? []).map((m) => m.user_id as string);
    if (userIds.length === 0) {
      return NextResponse.json(
        { skipped: "no merchant user for this restaurant" },
        { status: 202 }
      );
    }

    // app_users stores no address, so resolve each merchant's auth email.
    const { data: authList } = await supabase.auth.admin.listUsers();
    const recipients = userIds
      .map((id) => authList?.users.find((u) => u.id === id)?.email)
      .filter((e): e is string => Boolean(e));

    if (recipients.length === 0) {
      return NextResponse.json(
        { skipped: "merchant users have no email address" },
        { status: 202 }
      );
    }

    const mail = newOrderEmail(emailData);
    const results = await Promise.all(
      recipients.map((to) => sendOrderEmail(to, mail.subject, mail.html))
    );

    return NextResponse.json({ event, recipients, results });
  }

  // status_changed
  const mail = orderStatusEmail(emailData, order.status, reason);
  if (!mail) {
    return NextResponse.json(
      { skipped: `no email for status ${order.status}` },
      { status: 202 }
    );
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("email")
    .eq("name", order.customer)
    .maybeSingle();

  if (!customer?.email) {
    return NextResponse.json(
      { skipped: "no email address for this customer" },
      { status: 202 }
    );
  }

  const result = await sendOrderEmail(customer.email, mail.subject, mail.html);

  // A 202 keeps the merchant's accept/reject from failing just because email
  // is down; the status change is the thing that matters.
  return NextResponse.json(
    { event, to: customer.email, result },
    { status: result.ok ? 200 : 202 }
  );
}
