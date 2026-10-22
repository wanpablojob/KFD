import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  newOrderEmail,
  orderPlacedEmail,
  orderStatusEmail,
  tripStatusEmail,
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
  /**
   * A whole trip (0092). A basket from several shops is one order for the
   * customer: one receipt, one notice per milestone, and one call to this
   * route -- not one per shop, which would also run the caller into the rate
   * limit on a ten-shop basket.
   */
  deliveryId?: string;
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
  // True either way: a shop that takes orders automatically has the order the
  // moment it is placed, and a shop that answers it has it a moment later
  // (0121). What the customer needs to hear is that the kitchen has it.
  confirmed: (r) => ({
    title: "Order confirmed",
    body: `Order ${r} is with the restaurant.`,
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

/**
 * Customer-facing push copy for a TRIP (0092).
 *
 * A basket from several shops is one thing to the customer, so the trip's
 * milestones are the trip's, not the shops'. A shop that drops out is worth
 * saying out loud even though the trip itself is still open.
 */
const TRIP_STATUS_PUSH: Record<
  string,
  (ref: string) => { title: string; body: string }
> = {
  confirmed: (r) => ({
    title: "All restaurants have your order",
    body: `Every restaurant in your order ${r} has it now.`,
  }),
  preparing: (r) => ({
    title: "Your order is being prepared",
    body: `Order ${r} is being prepared.`,
  }),
  out_for_delivery: (r) => ({
    title: "Your order is on the way",
    body: `Order ${r} is on the way.`,
  }),
  delivered: (r) => ({
    title: "Your order was delivered",
    body: `Order ${r} has been delivered.`,
  }),
  cancelled: (r) => ({
    title: "A restaurant could not take it",
    body: `A restaurant on your order ${r} could not take it. We are sorting it out.`,
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
  const { orderId, deliveryId, event } = body;

  if ((!orderId && !deliveryId) || !event) {
    return NextResponse.json(
      { error: "orderId or deliveryId, and event, are required" },
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

  // The service role bypasses RLS, so every read below is unscoped by design.
  // That makes the caller's own access the only thing standing between a
  // signed-in user and another restaurant's order: without this, anyone with
  // an account could probe order ids and trigger mail to strangers.
  const { data: callerRow } = await supabase
    .from("app_users")
    .select("role, restaurant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const callerRole = (callerRow?.role as string | null) ?? null;
  const callerRestaurantId =
    (callerRow?.restaurant_id as string | null) ?? null;

  // A TRIP (0092): one basket from several shops, one receipt, one notice per
  // milestone. The customer is told about the trip; each shop is told about
  // its own part.
  let trip: TripRow | null = null;
  let tripParts: TripPart[] = [];

  if (deliveryId) {
    const { data: tripRow } = await supabase
      .from("deliveries")
      .select(
        "id, reference, customer, customer_user_id, total, status, shops, rider_id",
      )
      .eq("id", deliveryId)
      .maybeSingle();

    if (!tripRow) {
      return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
    }
    trip = tripRow as TripRow;
    tripParts = await readTripParts(supabase, trip.id);
  }

  // Read the order with the service role: the caller may be a customer, who
  // has no RLS access to orders at all.
  const { data: order, error: orderError } = orderId
    ? await supabase.from("orders").select("*").eq("id", orderId).maybeSingle()
    : { data: null, error: null };

  if (orderError) {
    reportServerError(orderError, "orders/notify");
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  if (orderId && !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // An order that belongs to a trip carries the trip with it, so the customer
  // hears about the trip and not about one shop of it.
  if (!trip && order?.delivery_id) {
    const { data: tripRow } = await supabase
      .from("deliveries")
      .select(
        "id, reference, customer, customer_user_id, total, status, shops, rider_id",
      )
      .eq("id", order.delivery_id)
      .maybeSingle();
    if (tripRow) {
      trip = tripRow as TripRow;
      tripParts = await readTripParts(supabase, trip.id);
    }
  }

  // The assigned rider's login, so a rider can announce pickup and delivery
  // for their own order and nobody else's.
  let riderUserId: string | null = null;
  if (order?.rider_id) {
    const { data: riderRow } = await supabase
      .from("riders")
      .select("user_id")
      .eq("id", order.rider_id)
      .maybeSingle();
    riderUserId = (riderRow?.user_id as string | null) ?? null;
  }

  if (trip && !order) {
    // The whole trip: the customer who placed it, the rider carrying it, or an
    // admin. The rider is here to close the trip ("delivered"), and the
    // customer to place it.
    const isOwner = trip.customer_user_id === user.id;
    let isTripRider = false;
    if (trip.rider_id) {
      const { data: tripRider } = await supabase
        .from("riders")
        .select("user_id")
        .eq("id", trip.rider_id)
        .maybeSingle();
      isTripRider = tripRider?.user_id === user.id;
    }
    if (!isOwner && !isTripRider && callerRole !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (order) {
    const allowed = mayNotifyOrder(
      event,
      {
        userId: user.id,
        role: callerRole,
        restaurantId: callerRestaurantId,
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
  }

  const emailData: OrderEmailData = {
    reference: order?.reference ?? trip?.reference ?? "",
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

    // A trip: every shop in it gets its own mail about ITS own part, and the
    // customer gets one receipt for the basket.
    const shopsToTell: { restaurant_id: string | null; part: TripPart | null }[] =
      trip
        ? tripParts
            .filter((part) => part.restaurant_id)
            .map((part) => ({ restaurant_id: part.restaurant_id, part }))
        : order?.restaurant_id
          ? [{ restaurant_id: order.restaurant_id, part: null }]
          : [];

    for (const shop of shopsToTell) {
      if (!shop.restaurant_id) continue;
      const { data: merchantRows } = await supabase
        .from("app_users")
        .select("user_id")
        .eq("restaurant_id", shop.restaurant_id)
        .eq("role", "merchant");

      const userIds = (merchantRows ?? []).map((m) => m.user_id as string);
      if (userIds.length === 0) continue;

      // app_users stores no address, so resolve each merchant's auth email.
      // The admin API paginates (50 per page by default), so a single call
      // silently stops resolving merchants once the project has more than
      // one page of users -- the order is placed, the merchant just never
      // hears about it. Walk the pages until every id is found or the list
      // ends, with a hard cap so a very large project cannot turn one order
      // into an unbounded crawl.
      const shopRecipients = await resolveMerchantEmails(supabase, userIds);
      recipients = recipients.concat(shopRecipients);

      // The merchant sees its OWN part: its food, its own subtotal. The trip's
      // fees are the customer's business, not the shop's.
      const shopData: OrderEmailData = shop.part
        ? {
            reference: shop.part.reference,
            restaurant: shop.part.restaurant,
            customer: trip?.customer ?? order?.customer ?? "",
            items: Array.isArray(shop.part.items) ? shop.part.items : [],
            total: Number(shop.part.subtotal),
          }
        : emailData;

      const mail = newOrderEmail(shopData);
      results = results.concat(
        await Promise.all(
          shopRecipients.map((to) =>
            sendOrderEmail(to, mail.subject, mail.html),
          ),
        ),
      );
    }

    // Then the customer's receipt. Independent of the merchant mail: even an
    // order the restaurant cannot be emailed about deserves a confirmation.
    // For a trip it is ONE receipt for the whole basket, with every shop's
    // food on it -- the customer paid one bill.
    const customerEmail = await resolveCustomerEmail(
      supabase,
      order ?? { customer_user_id: trip?.customer_user_id ?? null, customer: trip?.customer ?? "", restaurant: "", reference: trip?.reference ?? "", items: [], subtotal: 0, delivery_fee: 0, service_fee: 0, total: trip?.total ?? 0, status: trip?.status ?? "pending", payment: "cash", placed_at: new Date().toISOString() },
    );
    const tripMail = trip ? tripEmailData(trip, tripParts) : emailData;
    const customerMail = customerEmail ? orderPlacedEmail(tripMail) : null;
    const confirmation =
      customerEmail && customerMail
        ? await sendOrderEmail(customerEmail, customerMail.subject, customerMail.html)
        : {
            ok: false,
            detail: "no email address for this customer",
            skipped: "no email address for this customer",
          };

    // Expo Push for the same merchant accounts (Prompt 6.2). Best-effort like
    // the email: a push failure must not fail the order write. A trip pushes
    // each shop about ITS own part.
    const push = trip
      ? {
          ok: true,
          sent: (
            await Promise.all(
              shopsToTell.map((shop) =>
                shop.restaurant_id && shop.part
                  ? sendMerchantOrderPush(
                      supabase,
                      shop.restaurant_id,
                      shop.part.reference,
                    )
                  : Promise.resolve({ ok: false, sent: 0 }),
              ),
            )
          ).reduce((n, r) => n + (r.sent ?? 0), 0),
        }
      : order?.restaurant_id
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
  //
  // For a trip the customer hears about the TRIP, once per milestone: a
  // three-shop basket that is confirmed must not send three "confirmed"
  // notices, and the rider's delivery of the whole trip must send one.
  // A cancellation the customer made themselves needs no notice: they know,
  // and the wording for a shop dropping out would be wrong.
  const cancelledByCustomer =
    order?.status === "cancelled" &&
    order?.rejection_reason === "Cancelled by customer";

  const push = trip
    ? cancelledByCustomer
      ? { ok: true, sent: 0, skipped: "the customer cancelled it" }
      : await pushCustomerTripStatus(
          supabase,
          trip,
          order?.status ?? trip.status,
          reason,
        )
    : await pushCustomerStatus(supabase, order, reason);

  const mail = trip && cancelledByCustomer
    ? null
    : trip
    ? tripStatusEmail(
        {
          reference: trip.reference,
          items: tripEmailData(trip, tripParts).items,
          total: Number(trip.total),
        },
        order?.status === "cancelled" ? "cancelled" : trip.status,
        reason,
      )
    : orderStatusEmail(emailData, order?.status ?? "", reason);
  if (!mail) {
    return NextResponse.json(
      { skipped: `no email for status ${order?.status ?? trip?.status}`, push },
      { status: 202 },
    );
  }

  const email = await resolveCustomerEmail(
    supabase,
    order ?? { customer_user_id: trip?.customer_user_id ?? null, customer: trip?.customer ?? "", restaurant: "", reference: trip?.reference ?? "", items: [], subtotal: 0, delivery_fee: 0, service_fee: 0, total: trip?.total ?? 0, status: trip?.status ?? "pending", payment: "cash", placed_at: new Date().toISOString() },
  );

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

/** A trip as the notify route sees it. */
interface TripRow {
  id: string;
  reference: string;
  customer: string;
  customer_user_id: string | null;
  total: number;
  status: string;
  shops: number;
  /** The rider carrying it, when it has one. */
  rider_id: string | null;
}

/** One shop's part of a trip. */
interface TripPart {
  id: string;
  reference: string;
  restaurant: string;
  restaurant_id: string | null;
  items: unknown;
  subtotal: number;
  status: string;
  placed_at: string;
}

/** The shops of a trip, oldest first: the order the rider collects them in. */
async function readTripParts(
  supabase: NonNullable<ReturnType<typeof serviceClient>>,
  tripId: string,
): Promise<TripPart[]> {
  const { data } = await supabase
    .from("orders")
    .select(
      "id, reference, restaurant, restaurant_id, items, subtotal, status, placed_at",
    )
    .eq("delivery_id", tripId)
    .order("placed_at");
  return (data ?? []) as TripPart[];
}

/**
 * The customer's receipt for a whole trip: every shop's food on one list.
 *
 * The items carry the shop they came from, because two shops can sell the
 * same dish and the customer has to be able to tell them apart.
 */
function tripEmailData(trip: TripRow, parts: TripPart[]): OrderEmailData {
  return {
    reference: trip.reference,
    restaurant:
      parts.length === 1
        ? (parts[0]?.restaurant ?? trip.customer)
        : `${parts.length} restaurants`,
    customer: trip.customer,
    items: parts.flatMap((part) =>
      (Array.isArray(part.items) ? part.items : []).map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return {
          ...row,
          name: `${part.restaurant} · ${String(row.name ?? "")}`,
        } as OrderEmailData["items"][number];
      }),
    ),
    total: Number(trip.total),
  };
}

/**
 * The customer's push for a trip's milestone, once per milestone.
 *
 * A three-shop basket that every shop accepts must not send three
 * "accepted" notices, and the rider's delivery of the whole trip must send
 * one. The inbox row the push writes is the record of what was already sent,
 * so the second shop's acceptance finds it and stays quiet.
 */
async function pushCustomerTripStatus(
  supabase: NonNullable<ReturnType<typeof serviceClient>>,
  trip: TripRow,
  partStatus: string,
  reason?: string,
) {
  if (!trip.customer_user_id) {
    return { ok: false, sent: 0, skipped: "trip has no customer account" };
  }

  // A shop that dropped out is news even though the trip is still open; every
  // other milestone is the trip's own status.
  const milestone = partStatus === "cancelled" ? "cancelled" : trip.status;

  const copy = TRIP_STATUS_PUSH[milestone];
  if (!copy) {
    return { ok: false, sent: 0, skipped: `no push for status ${milestone}` };
  }

  const { data: alreadySent } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", trip.customer_user_id)
    .eq("data->>delivery_id", trip.id)
    .eq("data->>milestone", milestone)
    .limit(1);

  if (alreadySent && alreadySent.length > 0) {
    return { ok: true, sent: 0, skipped: "already sent for this trip" };
  }

  const { title, body } = copy(trip.reference);
  const withReason =
    milestone === "cancelled" && reason ? `${body} Reason: ${reason}` : body;

  return sendCustomerPush(
    supabase,
    trip.customer_user_id,
    title,
    withReason,
    {
      type: "order_status",
      reference: trip.reference,
      delivery_id: trip.id,
      milestone,
    },
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
