import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  newOrderEmail,
  orderPlacedEmail,
  orderStatusEmail,
  sendOrderEmail,
  type OrderEmailData,
} from "@/lib/server/order-email";
import { resolveCustomerEmail } from "@/lib/notify-customer";
import { mayNotifyOrder } from "@/lib/notify-authz";
import {
  sendMerchantOrderPush,
  sendCustomerPush,
} from "@/lib/server/push-notify";
import { reportServerError } from "@/lib/server/report-error";
import { checkRateLimit } from "@/lib/server/rate-limit";

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
 *   placed          -> the merchants of the restaurant, and the ordering customer
 *   status_changed  -> the customer on the order
 *
 * `placed` is called by the customer app right after the order RPC returns,
 * and by an admin. The caller is always the verified JWT subject; the rule for
 * who may notify about which order lives in @/lib/notify-authz, because the
 * order itself is read with the service role and RLS cannot help here.
 */

interface NotifyBody {
  orderId?: string;
  event?: "placed" | "status_changed";
  reason?: string;
}

export const runtime = "nodejs";

/**
 * Customer-facing push copy per status. Keys mirror the order_status enum; a
 * status with no entry here produces no push rather than a generic one.
 */
const CUSTOMER_STATUS_PUSH: Record<
  string,
  (ref: string) => { title: string; body: string }
> = {
  confirmed: (r) => ({
    title: "Order confirmed",
    body: `Order ${r} was accepted by the restaurant.`,
  }),
  preparing: (r) => ({
    title: "Order being prepared",
    body: `Order ${r} is being prepared.`,
  }),
  out_for_delivery: (r) => ({
    title: "Order on the way",
    body: `Order ${r} is on the way.`,
  }),
  delivered: (r) => ({
    title: "Order delivered",
    body: `Order ${r} has been delivered.`,
  }),
  cancelled: (r) => ({
    title: "Order cancelled",
    body: `Order ${r} was cancelled.`,
  }),
};

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
  const { orderId, event } = body;

  if (!orderId || !event) {
    return NextResponse.json(
      { error: "orderId and event are required" },
      { status: 400 },
    );
  }

  // The reason is written into the email body, so cap it here as well as
  // escaping it downstream: a bound on length is cheaper than letting an
  // authenticated caller push arbitrary bulk through the mail provider.
  const reason =
    typeof body.reason === "string" ? body.reason.slice(0, 280) : undefined;

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const supabase = serviceClient();

  if (!url || !anonKey || !supabase) {
    reportServerError(new Error("Server is missing Supabase configuration"), "orders/notify");
    return NextResponse.json(
      { error: "Server is missing Supabase configuration" },
      { status: 500 },
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

  // Each accepted call sends mail through Resend and push through Expo on the
  // platform account. Without a bound, a signed-in customer could repeat a
  // "placed" call for their own order and email every merchant at the
  // restaurant as fast as the route answers. The key is the verified user id,
  // not a body field, so nobody can spend another account's budget.
  const limited = checkRateLimit(`orders-notify:${user.id}`, 8, 60_000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many notifications requested. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  // Read the order with the service role: the caller may be a customer, who
  // has no RLS access to orders at all.
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    reportServerError(orderError, "orders/notify");
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // The service role bypasses RLS, so the order read above is unscoped by
  // design. That makes the caller's own access the only thing standing between
  // a signed-in user and another restaurant's order: without this, anyone with
  // an account could probe order ids and trigger mail to strangers.
  const { data: callerRow } = await supabase
    .from("app_users")
    .select("role, restaurant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // The assigned rider's login, so a rider can announce pickup and delivery
  // for their own order and nobody else's.
  let riderUserId: string | null = null;
  if (order.rider_id) {
    const { data: riderRow } = await supabase
      .from("riders")
      .select("user_id")
      .eq("id", order.rider_id)
      .maybeSingle();
    riderUserId = (riderRow?.user_id as string | null) ?? null;
  }

  const allowed = mayNotifyOrder(
    event,
    {
      userId: user.id,
      role: (callerRow?.role as string | null) ?? null,
      restaurantId: (callerRow?.restaurant_id as string | null) ?? null,
    },
    {
      restaurantId: order.restaurant_id ?? null,
      customerUserId: order.customer_user_id ?? null,
      riderUserId,
      status: order.status,
    },
  );

  if (!allowed) {
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
    // Tell the restaurant first: this is the order it has to cook. An order
    // with no restaurant_id is legacy/walk-in, so there is nobody to tell and
    // the customer confirmation below still goes out.
    let recipients: string[] = [];
    let results: Awaited<ReturnType<typeof sendOrderEmail>>[] = [];

    if (order.restaurant_id) {
      const { data: merchantRows } = await supabase
        .from("app_users")
        .select("user_id")
        .eq("restaurant_id", order.restaurant_id)
        .eq("role", "merchant");

      const userIds = (merchantRows ?? []).map((m) => m.user_id as string);

      if (userIds.length > 0) {
        // app_users stores no address, so resolve each merchant's auth email.
        // The admin API paginates (50 per page by default), so a single call
        // silently stops resolving merchants once the project has more than
        // one page of users -- the order is placed, the merchant just never
        // hears about it. Walk the pages until every id is found or the list
        // ends, with a hard cap so a very large project cannot turn one order
        // into an unbounded crawl.
        recipients = await resolveMerchantEmails(supabase, userIds);

        const mail = newOrderEmail(emailData);
        results = await Promise.all(
          recipients.map((to) => sendOrderEmail(to, mail.subject, mail.html)),
        );
      }
    }

    // Then the customer's receipt. Independent of the merchant mail: even an
    // order the restaurant cannot be emailed about deserves a confirmation.
    const customerEmail = await resolveCustomerEmail(supabase, order);
    const customerMail = customerEmail ? orderPlacedEmail(emailData) : null;
    const confirmation =
      customerEmail && customerMail
        ? await sendOrderEmail(customerEmail, customerMail.subject, customerMail.html)
        : {
            ok: false,
            detail: "no email address for this customer",
            skipped: "no email address for this customer",
          };

    // Expo Push for the same merchant accounts (Prompt 6.2). Best-effort like
    // the email: a push failure must not fail the order write.
    const push = order.restaurant_id
      ? await sendMerchantOrderPush(
          supabase,
          order.restaurant_id,
          order.reference,
        )
      : { ok: false, sent: 0, skipped: "order has no restaurant_id" };

    // Counts and outcomes only. The caller is a verified customer, admin, or
    // merchant, but none of them needs the other party's address echoed back:
    // a merchant or the assigned rider could otherwise read the customer's
    // email straight out of this response, and the customer could harvest
    // every merchant address at the restaurant. The recipient list stays
    // server-side; the UI only needs to know whether the mail went out.
    return NextResponse.json({
      event,
      recipientCount: recipients.length,
      results,
      customer: { configured: Boolean(customerEmail), result: confirmation },
      push,
    });
  }

  // status_changed
  //
  // Push the customer first and independently of email: it targets the order's
  // customer_user_id and must still fire when there is no address on file. A
  // legacy order placed before customer accounts existed has no user id, which
  // is a skip, not an error. Best-effort -- the status write already landed.
  const push = await pushCustomerStatus(supabase, order, reason);

  const mail = orderStatusEmail(emailData, order.status, reason);
  if (!mail) {
    return NextResponse.json(
      { skipped: `no email for status ${order.status}`, push },
      { status: 202 },
    );
  }

  const email = await resolveCustomerEmail(supabase, order);

  if (!email) {
    return NextResponse.json(
      { skipped: "no email address for this customer", push },
      { status: 202 },
    );
  }

  const result = await sendOrderEmail(email, mail.subject, mail.html);

  // A 202 keeps the merchant's accept/reject from failing just because email
  // is down; the status change is the thing that matters. The address is
  // deliberately not echoed: this response reaches a merchant or rider, and
  // the customer's email is not theirs to read.
  return NextResponse.json(
    { event, delivered: result.ok, result, push },
    { status: result.ok ? 200 : 202 },
  );
}

/** Send the customer a push for this status, if the order and status allow it. */
async function pushCustomerStatus(
  supabase: NonNullable<ReturnType<typeof serviceClient>>,
  order: { reference: string; status: string; customer_user_id: string | null },
  reason?: string,
) {
  if (!order.customer_user_id) {
    return { ok: false, sent: 0, skipped: "order has no customer account" };
  }

  const copy = CUSTOMER_STATUS_PUSH[order.status];
  if (!copy) {
    return {
      ok: false,
      sent: 0,
      skipped: `no push for status ${order.status}`,
    };
  }

  const { title, body } = copy(order.reference);
  // The reason is customer-visible in the rejection email too, so it is safe
  // here; it is capped by the same check earlier in the request.
  const withReason =
    order.status === "cancelled" && reason ? `${body} Reason: ${reason}` : body;

  return sendCustomerPush(supabase, order.customer_user_id, title, withReason, {
    type: "order_status",
    reference: order.reference,
  });
}

/**
 * Resolve auth emails for a set of user ids, walking the admin API's pages.
 *
 * `app_users` carries no address, so `auth.users` is the only source. The
 * admin list endpoint is paginated (50 per page by default), and the previous
 * single call resolved at most the first page -- every merchant beyond it was
 * silently skipped, so the order was placed and the kitchen was never told.
 * Results keep the caller's order and drop ids with no account, which is a
 * skip rather than an error.
 */
async function resolveMerchantEmails(
  supabase: NonNullable<ReturnType<typeof serviceClient>>,
  userIds: string[],
): Promise<string[]> {
  const wanted = new Set(userIds);
  const emails = new Map<string, string>();
  const perPage = 1000;

  // A cap rather than `while (true)`: a project large enough to exceed twenty
  // pages should degrade to "some merchants were not emailed", never to a
  // request that crawls the whole user table before it can answer.
  for (let page = 1; page <= 20 && emails.size < wanted.size; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) break;

    for (const user of data.users) {
      if (user.id && user.email && wanted.has(user.id)) {
        emails.set(user.id, user.email);
      }
    }

    if (data.users.length < perPage) break;
  }

  return userIds
    .map((id) => emails.get(id))
    .filter((email): email is string => Boolean(email));
}
