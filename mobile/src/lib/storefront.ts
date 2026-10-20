import { supabase } from "./supabase";
import { postApi } from "./admin-api";
import { missingMigrationMessage } from "./missing-migration";

type VehicleType = "bicycle" | "scooter" | "motorcycle" | "car";

export interface RestaurantRow {
  id: string;
  name: string;
  cuisine: string;
  city: string;
  rating: number;
  status: string;
  archived_at: string | null;
  /** False while the merchant has closed the kitchen (0077). */
  is_open: boolean;
  /** Merchant's typical prep time in minutes, for the delivery estimate (0077). */
  prep_minutes: number;
  /** Shop photo set by the merchant (0090); null shows the initial. */
  image_url: string | null;
}

export interface MenuItemRow {
  id: string;
  restaurant: string;
  restaurant_id: string;
  name: string;
  category: string;
  price: number;
  available: boolean;
  /** Optional image URL; null when none has been set (migration 0056). */
  image_url: string | null;
}

/** Restaurants surfaced to customers: active and not archived (RLS enforces). */
export async function fetchActiveRestaurants(): Promise<RestaurantRow[]> {
  const { data, error } = await supabase
    .from("restaurants")
    .select(
      "id, name, cuisine, city, rating, status, archived_at, is_open, prep_minutes, image_url"
    )
    .eq("status", "active")
    .is("archived_at", null)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/**
 * One active restaurant's public fields, for the menu screen header. Null when
 * the id is not an active restaurant (RLS scopes the read to customers).
 */
export async function fetchRestaurant(id: string): Promise<RestaurantRow | null> {
  const { data, error } = await supabase
    .from("restaurants")
    .select(
      "id, name, cuisine, city, rating, status, archived_at, is_open, prep_minutes, image_url"
    )
    .eq("id", id)
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as RestaurantRow | null) ?? null;
}

/**
 * Server-side restaurant search: matches name or cuisine against a substring
 * and optionally narrows to one cuisine. Replaces the client-side filter in
 * the home screen so the catalogue does not all have to travel to the device.
 */
export async function searchRestaurants(
  query: string,
  cuisine: string | null
): Promise<RestaurantRow[]> {
  const { data, error } = await supabase.rpc("search_restaurants", {
    p_query: query,
    p_cuisine: cuisine ?? undefined,
  });
  if (error) throw error;
  return (data ?? []) as RestaurantRow[];
}

/** Menu for one restaurant: available items only (RLS enforces). */
export async function fetchMenu(restaurantId: string): Promise<MenuItemRow[]> {
  const { data, error } = await supabase
    .from("menu_items")
    .select(
      "id, restaurant, restaurant_id, name, category, price, available, image_url"
    )
    .eq("restaurant_id", restaurantId)
    .eq("available", true)
    .order("category")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export interface PlaceOrderResult {
  order_id: string;
  reference: string;
  total: number;
  status: string;
}

export interface OrderLine {
  name: string;
  quantity: number;
  price: number;
  /** Absent on orders placed before 0053; reorder then falls back to name. */
  menu_item_id?: string | null;
}

/**
 * orders.items is jsonb, so the schema types it as `Json` and nothing downstream
 * can trust it. customer_place_order writes {name, quantity, price, menu_item_id}
 * per line, so parse that and drop anything that does not fit rather than casting
 * the array and pretending. Same guard as the admin dispatch list.
 */
function parseOrderItems(value: unknown): OrderLine[] {
  if (!Array.isArray(value)) return [];
  const lines: OrderLine[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object") continue;
    const { name, quantity, price, menu_item_id } = entry as Record<string, unknown>;
    if (typeof name !== "string" || typeof quantity !== "number") continue;
    lines.push({
      name,
      quantity,
      price: typeof price === "number" ? price : 0,
      ...(typeof menu_item_id === "string" ? { menu_item_id } : {}),
    });
  }
  return lines;
}

export interface RiderOrderPageItem {
  id: string;
  reference: string;
  customer: string;
  /** Null when the customer never set a contact number in their profile. */
  customer_phone: string | null;
  restaurant: string;
  /** Null for orders placed before delivery addresses existed. */
  delivery_address: string | null;
  items: OrderLine[];
  total: number;
  /** Null until a rider claims the order; the agreed fee, frozen at claim. */
  rider_payout: number | null;
  status: string;
  payment: string;
  placed_at: string;
  next_cursor: string | null;
}

export interface RiderOrderPageResult {
  items: RiderOrderPageItem[];
  nextCursor: string | null;
}

/**
 * A `fetch_rider_orders_page` row as the app uses it.
 *
 * gen-types cannot infer nullability for a RETURNS TABLE, so it hands back every
 * column as non-null. customer_phone, delivery_address, rider_payout and
 * next_cursor are genuinely nullable, so the row is mapped field by field rather
 * than cast: a cast would be the compiler agreeing with a lie, and the symptom
 * would be the string "null" on a rider's card.
 *
 * Exported so it has a test (storefront-mapping.test.ts).
 */
export function mapRiderOrderRow(row: Record<string, unknown>): RiderOrderPageItem {
  return {
    id: String(row.id),
    reference: String(row.reference),
    customer: String(row.customer),
    customer_phone: (row.customer_phone as string | null) ?? null,
    restaurant: String(row.restaurant),
    delivery_address: (row.delivery_address as string | null) ?? null,
    items: parseOrderItems(row.items),
    total: Number(row.total),
    rider_payout:
      row.rider_payout === null || row.rider_payout === undefined
        ? null
        : Number(row.rider_payout),
    status: String(row.status),
    payment: String(row.payment),
    placed_at: String(row.placed_at),
    next_cursor: (row.next_cursor as string | null) ?? null,
  };
}

/**
 * A live offer: an order the system has put in front of this rider to accept or
 * decline. Not yet theirs, so it carries no rider_payout -- the fee shown is the
 * standard rate, frozen onto the order only if they accept.
 */
export interface RiderOffer {
  offerId: number;
  orderId: string;
  reference: string;
  restaurant: string;
  customer: string;
  deliveryAddress: string | null;
  items: OrderLine[];
  total: number;
  orderStatus: string;
  /** What they would earn. Null only if an offer outlived its order's payout. */
  payoutPerDelivery: number | null;
  city: string | null;
  offeredAt: string;
  expiresAt: string;
}

/** An `fetch_rider_offers` row, mapped for the same reason as mapRiderOrderRow. */
export function mapRiderOfferRow(row: Record<string, unknown>): RiderOffer {
  return {
    offerId: Number(row.offer_id),
    orderId: String(row.order_id),
    reference: String(row.reference),
    restaurant: String(row.restaurant),
    customer: String(row.customer),
    deliveryAddress: (row.delivery_address as string | null) ?? null,
    items: parseOrderItems(row.items),
    total: Number(row.total),
    orderStatus: String(row.order_status),
    payoutPerDelivery:
      row.payout_per_delivery === null || row.payout_per_delivery === undefined
        ? null
        : Number(row.payout_per_delivery),
    city: (row.city as string | null) ?? null,
    offeredAt: String(row.offered_at),
    expiresAt: String(row.expires_at),
  };
}

/**
 * Live offers for the calling rider (migration 0045).
 *
 * Polls on a short interval because offers are time-boxed: without a refresh the
 * expiry countdown is a lie and Accept would fail against a row that quietly
 * went stale. refetchInterval is on the hook, not here.
 */
export async function fetchRiderOffers(): Promise<RiderOffer[]> {
  const { data, error } = await supabase.rpc("fetch_rider_offers");
  if (error) throw error;

  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapRiderOfferRow);
}

/**
 * Accept an offer. Returns the frozen payout the claim wrote onto the order, so
 * the UI can confirm the number the rider agreed to rather than re-deriving it.
 */
export async function acceptRiderOffer(
  orderId: string
): Promise<{ reference: string; riderPayout: number }> {
  const { data, error } = await supabase.rpc("claim_order", { p_order_id: orderId });
  if (error) throw error;
  const row = (data ?? [])[0] as
    { reference: string; rider_payout: number } | undefined;
  if (!row) throw new Error("The delivery was taken before you accepted it.");
  return { reference: row.reference, riderPayout: Number(row.rider_payout) };
}

/**
 * Rider confirms they have collected the food, moving the order to
 * out_for_delivery (migration 0071).
 *
 * This is the rider's own fact to assert: the moment the food is physically in
 * their hands. It is also what the customer is waiting to see on the tracker,
 * which previously could never leave 'Being prepared'.
 *
 * Idempotent server-side: a second tap returns the same order rather than
 * failing, because a rider double-tapping is not a mistake worth an error.
 */
export async function markOrderPickedUp(orderId: string): Promise<void> {
  const { error } = await supabase.rpc("rider_mark_picked_up", {
    p_order_id: orderId,
  });
  if (error) throw error;
  // Tell the customer "on the way": push plus inbox. Best-effort, never blocks.
  void postApi("/api/orders/notify", { orderId, event: "status_changed" });
}

/** Decline an offer. The system offers it to the next rider in rotation. */
export async function declineRiderOffer(orderId: string): Promise<void> {
  const { error } = await supabase.rpc("decline_order", { p_order_id: orderId });
  if (error) throw error;
}

/** Cursor-paginated orders for the calling rider. */
export async function fetchRiderOrdersPage(
  cursor: string | null,
  limit = 20,
  /**
   * Only the orders that are not part of a trip (0092). A trip's shops are
   * listed as one trip, not one card per shop, so the rider's list asks for
   * the rest.
   */
  onlyLegacy = false
): Promise<RiderOrderPageResult> {
  // Omitted rather than null for page 1: p_cursor defaults to null in SQL, and
  // the generated arg type is optional, not nullable.
  const { data, error } = await supabase.rpc("fetch_rider_orders_page", {
    p_cursor: cursor ?? undefined,
    p_limit: limit,
    p_only_legacy: onlyLegacy,
  });
  if (error) throw error;

  // Mapped rather than cast: see mapRiderOrderRow for why gen-types cannot be
  // trusted about nullability here.
  const rows: RiderOrderPageItem[] = (
    (data ?? []) as unknown as Record<string, unknown>[]
  ).map(mapRiderOrderRow);

  // All rows in a page have the same next_cursor (from the window function)
  const nextCursor = rows[0]?.next_cursor ?? null;
  return { items: rows, nextCursor };
}

/**
 * Rider earnings, summed from the payout ledger rather than the lifetime
 * aggregate. `riders.earnings` is reconciled to the same sum server-side, but
 * the ledger is the record that a number came from a real delivery.
 */
export interface RiderEarningsSummary {
  earned_today: number;
  earned_week: number;
  lifetime: number;
  delivery_count: number;
  /** Null until the rider has completed a delivery since the ledger existed. */
  first_earned_at: string | null;
  last_earned_at: string | null;
}

export async function fetchRiderEarningsSummary(): Promise<RiderEarningsSummary> {
  const { data, error } = await supabase.rpc("rider_earnings_summary");
  if (error) throw error;

  // The RPC always returns exactly one aggregate row, even for a rider with no
  // payouts, so a missing row means the call shape is wrong, not empty.
  const row = data?.[0];
  if (!row) {
    throw new Error("Earnings summary came back empty.");
  }

  // Same RETURNS TABLE nullability gap as fetchRiderOrdersPage: first/last are
  // genuinely null before the rider's first delivery.
  return {
    earned_today: row.earned_today,
    earned_week: row.earned_week,
    lifetime: row.lifetime,
    delivery_count: row.delivery_count,
    first_earned_at: row.first_earned_at ?? null,
    last_earned_at: row.last_earned_at ?? null,
  };
}

/**
 * Where a payout sits in its 24-hour review window (migration 0075).
 *
 * Absent before 0075 is applied; the earnings screen treats anything other than
 * 'disputed' as final, which is the old behaviour and the safe one.
 */
export type PayoutSettlementState =
  "pending_review" | "settled" | "disputed" | "reversed";

/** One completed delivery and what it was worth. */
export interface RiderPayoutRow {
  order_id: string;
  order_reference: string;
  restaurant: string;
  amount: number;
  earned_at: string;
  /** 0075. */
  settlement_state?: PayoutSettlementState;
}

export interface RiderPayoutHistory {
  items: RiderPayoutRow[];
  /** True when the rider has more deliveries than the limit returned. */
  hasMore: boolean;
}

export async function fetchRiderPayoutHistory(limit = 20): Promise<RiderPayoutHistory> {
  const { data, error } = await supabase.rpc("rider_payout_history", {
    p_limit: limit,
  });
  if (error) throw error;

  const rows = data ?? [];
  return {
    items: rows.map((row) => ({
      order_id: row.order_id,
      order_reference: row.order_reference,
      restaurant: row.restaurant,
      amount: row.amount,
      earned_at: row.earned_at,
      // Narrow the wire's plain string to the four known states, defaulting to
      // pending_review for anything unrecognised (including pre-0075, where the
      // column is absent). The Earnings screen only reacts to 'disputed', so an
      // unknown value reads as an ordinary payout rather than a broken one.
      settlement_state:
        row.settlement_state === "settled" ||
        row.settlement_state === "disputed" ||
        row.settlement_state === "reversed"
          ? row.settlement_state
          : "pending_review",
    })),
    hasMore: rows[0]?.has_more ?? false,
  };
}

export interface RiderProfile {
  id: string;
  name: string;
  city: string;
  vehicle: string;
  status: string;
  deliveries: number;
  rating: number;
  earnings: number;
  gcash_qr_url: string | null;
  gcash_name: string | null;
}

/**
 * Columns that are always expected, kept separate from the optional pair below.
 */
const RIDER_PROFILE_COLUMNS =
  "id, name, city, vehicle, status, deliveries, rating, earnings";

/** Migration 0057. Absent until it is applied; see fetchRiderProfile. */
const RIDER_PROFILE_PAYOUT_COLUMNS = "gcash_qr_url, gcash_name";

/** The migration that owns the payout columns, for the error message. */
const RIDER_GCASH_MIGRATION = "0057_rider_gcash.sql";

/**
 * The calling rider's own row (RLS scopes it to user_id = auth.uid()).
 *
 * The GCash payout columns are asked for separately and are optional. Selecting
 * them in the main query meant that on any project without 0057 applied,
 * PostgREST rejected the *entire* statement -- so the rider lost their name,
 * their delivery count and their earnings, and the screen said their profile
 * could not be loaded, over a pair of fields that only affect how they get
 * paid. Asking twice turns an unapplied optional migration into a missing
 * payout section instead of a blank rider profile.
 *
 * The retry is not silent: if the payout read fails for any other reason it is
 * rethrown, because losing the payout details without saying so is worse than
 * saying them and being wrong.
 */
export async function fetchRiderProfile(userId: string): Promise<RiderProfile | null> {
  const base = await supabase
    .from("riders")
    .select(RIDER_PROFILE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (base.error) throw base.error;

  // No rider row at all is the "no profile" answer, not a reason to try again.
  if (!base.data) return null;

  const payout = await supabase
    .from("riders")
    .select(RIDER_PROFILE_PAYOUT_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (payout.error) {
    const missing = missingMigrationMessage(payout.error, RIDER_GCASH_MIGRATION);
    if (missing) {
      // Known-unapplied migration: the rider still gets their profile, and the
      // payout fields read as absent rather than the whole screen failing.
      if (__DEV__) console.warn(`[rider] payout columns unavailable: ${missing}`);
      return { ...(base.data as RiderProfile), gcash_qr_url: null, gcash_name: null };
    }
    throw payout.error;
  }

  const details = (payout.data ?? {}) as Partial<
    Pick<RiderProfile, "gcash_qr_url" | "gcash_name">
  >;
  return {
    ...(base.data as RiderProfile),
    gcash_qr_url: details.gcash_qr_url ?? null,
    gcash_name: details.gcash_name ?? null,
  };
}

/** Set or clear the calling rider's GCash QR URL and account name. */
export async function setRiderGcash(
  qrUrl: string | null,
  name: string | null
): Promise<void> {
  const { error } = await supabase.rpc("rider_set_gcash", {
    // '' rather than null to clear: rider_set_gcash does
    // nullif(btrim(coalesce(p, '')), ''), so both store null, and the generated
    // types (correctly) do not admit null for an argument with no default.
    p_qr_url: qrUrl ?? "",
    p_name: name ?? "",
  });
  if (error) throw error;
}

export interface RiderPayment {
  reference: string;
  riderName: string;
  gcashQrUrl: string;
  gcashName: string | null;
}

/**
 * The assigned rider's GCash QR for an e_wallet order, or null. The server
 * returns it only to the order's own customer and only once a rider with a QR
 * is assigned; everyone else gets null and the tracker shows no payment block.
 */
export async function fetchOrderRiderPayment(
  reference: string
): Promise<RiderPayment | null> {
  const { data, error } = await supabase.rpc("order_rider_payment", {
    p_reference: reference,
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    reference: row.reference,
    riderName: row.rider_name,
    gcashQrUrl: row.gcash_qr_url,
    gcashName: row.gcash_name ?? null,
  };
}

export interface CustomerOrder {
  id: string;
  reference: string;
  restaurant: string;
  /** Null only for orders placed before restaurants were linked. */
  restaurant_id: string | null;
  /** Null when no rider has been assigned; decides if the rider can be rated. */
  rider_id: string | null;
  /**
   * The trip this order is part of (0092), when it is one shop of a basket.
   * Null for a single-shop order. The customer is given the trip's reference,
   * not the shop's, so the history has to say which is which.
   */
  delivery_id: string | null;
  items: {
    name: string;
    quantity: number;
    price: number;
    /** Absent on orders placed before 0053; reorder then falls back to name. */
    menu_item_id?: string | null;
  }[];
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  total: number;
  status: string;
  payment: string;
  placed_at: string;
  delivery_address: string | null;
}

/**
 * An `orders` row as the customer screens use it.
 *
 * The select lists exactly these columns, so a missing one means the query and
 * this mapping have drifted, not that the data is absent. The three nullable
 * columns are the ones that actually arrive null (old orders), and they are
 * mapped rather than cast so their types are checked here, once.
 */
export function mapMyOrderRow(row: Record<string, unknown>): CustomerOrder {
  return {
    id: String(row.id),
    reference: String(row.reference),
    restaurant: String(row.restaurant),
    restaurant_id: (row.restaurant_id as string | null) ?? null,
    rider_id: (row.rider_id as string | null) ?? null,
    delivery_id: (row.delivery_id as string | null) ?? null,
    items: parseOrderItems(row.items),
    subtotal: Number(row.subtotal),
    delivery_fee: Number(row.delivery_fee),
    service_fee: Number(row.service_fee),
    total: Number(row.total),
    status: String(row.status),
    payment: String(row.payment),
    placed_at: String(row.placed_at),
    delivery_address: (row.delivery_address as string | null) ?? null,
  };
}

/** This customer's own orders, newest first (RLS: customer_user_id = auth.uid()). */
export async function fetchMyOrders(): Promise<CustomerOrder[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, reference, restaurant, restaurant_id, rider_id, delivery_id, items, subtotal, delivery_fee, service_fee, total, status, payment, placed_at, delivery_address"
    )
    .order("placed_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapMyOrderRow);
}

/** One of the customer's own trips (0092). */
export interface CustomerDelivery {
  id: string;
  reference: string;
  status: string;
  shops: number;
  total: number;
  placed_at: string;
}

/**
 * The customer's own trips, newest first.
 *
 * A basket from several shops is one trip, and the customer is given the
 * trip's reference -- so the history needs the trip's reference to show, and
 * the trip's own status and total. RLS: customer_user_id = auth.uid().
 */
export async function fetchMyDeliveries(): Promise<CustomerDelivery[]> {
  const { data, error } = await supabase
    .from("deliveries")
    .select("id, reference, status, shops, total, placed_at")
    .order("placed_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    reference: String(row.reference),
    status: String(row.status),
    shops: Number(row.shops),
    total: Number(row.total),
    placed_at: String(row.placed_at),
  }));
}

/**
 * Public order tracking (anon-callable). `track_order` returns a fixed
 * projection and null when the reference matches nothing, so the caller
 * distinguishes "no such order" from a transport error.
 *
 * It returns the fee breakdown (subtotal, delivery_fee, service_fee, total) and
 * the delivery address. The address is PII and this RPC is anon-callable, so the
 * server returns it only to the order's own customer; for anyone else it is null.
 */
export interface TrackedOrder {
  reference: string;
  restaurant: string;
  items: OrderLine[];
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  total: number;
  status: string;
  payment: string;
  placed_at: string;
  /** Null unless the caller is signed in as the order's own customer. */
  delivery_address: string | null;
  /** Restaurant prep time snapshotted at order time; null on orders before 0077. */
  prep_minutes: number | null;
}

/**
 * Report a problem with a completed delivery (migration 0075, anon-callable).
 *
 * The recovery half of the dispute window: a payout is reversible for 24 hours,
 * and this is how a customer actually reaches that. It takes the receipt
 * reference rather than an order id because the customer has the receipt and not
 * the id, and it is anon-callable because walk-in customers have no account --
 * the same posture as track_order, and the reference is high-entropy.
 *
 * Moves no money. It flags the payout for an admin, who releases it to the rider
 * or reverses it. The rider's pay is never withheld while that is pending.
 */
export async function reportDeliveryIssue(
  reference: string,
  reason: string
): Promise<{ orderId: string; reference: string }> {
  const { data, error } = await supabase.rpc("report_delivery_issue", {
    p_reference: reference,
    p_reason: reason,
  });
  if (error) throw error;

  const row = ((data ?? []) as unknown as Record<string, unknown>[])[0];
  if (!row) {
    // The RPC raises rather than returning empty, so this means the row vanished
    // mid-flight rather than "nothing was wrong".
    throw new Error("Could not report that delivery. Try again.");
  }
  return { orderId: String(row.order_id), reference: String(row.reference) };
}

export async function fetchTrackedOrder(
  reference: string
): Promise<TrackedOrder | null> {
  const { data, error } = await supabase.rpc("track_order", {
    p_reference: reference,
  });
  if (error) throw error;

  const row = ((data ?? []) as unknown as Record<string, unknown>[])[0];
  if (!row) return null;

  // items is jsonb; parse it rather than cast, same guard as the admin
  // dispatch list and the rider order page.
  return {
    reference: String(row.reference),
    restaurant: String(row.restaurant),
    items: parseOrderItems(row.items),
    subtotal: Number(row.subtotal),
    delivery_fee: Number(row.delivery_fee),
    service_fee: Number(row.service_fee),
    total: Number(row.total),
    status: String(row.status),
    payment: String(row.payment),
    placed_at: String(row.placed_at),
    delivery_address: (row.delivery_address as string | null) ?? null,
    prep_minutes: row.prep_minutes == null ? null : Number(row.prep_minutes),
  };
}

// A type alias, not an interface: an interface has no implicit index
// signature, so it is not assignable to the generated Json the RPC takes.
export type PlaceOrderItem = {
  menu_item_id: string;
  quantity: number;
};

export type PaymentChoice = "cash" | "card" | "e_wallet";

export interface OrderQuote {
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  total: number;
  /** The fee is settled with the rider at the door, so `total` leaves it out (0080). */
  fee_agreed_in_person?: boolean;
}

export interface OrderFees {
  delivery_fee: number;
  service_fee: number;
}

/**
 * The platform fees, for places that state a delivery price before a cart
 * exists (the restaurant card). Same source as the checkout total, so the
 * advertised figure and the charged one cannot drift.
 */
export async function fetchOrderFees(): Promise<OrderFees> {
  const { data, error } = await supabase.rpc("order_fees");
  if (error) throw error;
  if (!data || data.length !== 1) {
    throw new Error("Could not load delivery pricing.");
  }
  return data[0];
}

/**
 * Server-authoritative price preview (migration 0033).
 *
 * The checkout screen used to total the cart itself from hardcoded constants
 * copied from inside customer_place_order(). Two copies of a price is one copy
 * too many: edit one and the customer is shown a total the server then
 * contradicts. This asks the server instead, so the preview and the charge
 * cannot disagree.
 *
 * Throws with the RPC error when a line has gone unavailable, which is the same
 * wording the real order will produce.
 */
export async function quoteOrder(args: {
  restaurantId: string;
  items: PlaceOrderItem[];
  /** Destination, so the quoted fee is the zonal one customer_place_order will charge (0080). */
  barangay?: string | null;
}): Promise<OrderQuote> {
  const { data, error } = await supabase.rpc("quote_order", {
    p_restaurant_id: args.restaurantId,
    p_items: args.items,
    p_delivery_barangay: args.barangay ?? undefined,
  });
  if (error) throw error;
  if (!data || data.length !== 1) {
    throw new Error("Could not price this cart. Try again.");
  }
  return data[0];
}

/** Server-side priced + minted order. Throws with the RPC error on rejection. */
export async function placeCustomerOrder(args: {
  restaurantId: string;
  items: PlaceOrderItem[];
  deliveryAddress: string;
  payment: PaymentChoice;
  /** Same value on every retry of one checkout, so a lost response cannot double-order. */
  requestId: string;
  /** Required by the server once service_areas is published (0077). */
  barangay?: string | null;
}): Promise<PlaceOrderResult> {
  const { data, error } = await supabase.rpc("customer_place_order", {
    p_restaurant_id: args.restaurantId,
    p_items: args.items,
    p_delivery_address: args.deliveryAddress,
    p_payment: args.payment,
    p_client_request_id: args.requestId,
    p_delivery_barangay: args.barangay ?? undefined,
  });
  if (error) throw error;
  if (!data || data.length !== 1) {
    throw new Error("Order was not placed. Try again.");
  }

  // Tell the admin app the order exists, so the restaurant gets its new-order
  // email/push and the customer gets a confirmation email. Best-effort and not
  // awaited: the order is already saved, and a slow mailer must not hold up
  // checkout. The API re-checks ownership against the token, not the body.
  void postApi("/api/orders/notify", {
    orderId: data[0].order_id,
    event: "placed",
  });

  return data[0];
}

/**
 * One shop's part of a basket, as the server wants it (0092).
 *
 * The basket may hold food from several restaurants: the customer checks out
 * once and one rider collects from every shop and delivers it in one trip.
 */
export type QuoteShop = {
  restaurant_id: string;
  items: PlaceOrderItem[];
};

/** What the server prices for one shop, so the checkout can show a per-shop subtotal. */
export interface QuotedShop {
  restaurant_id: string;
  restaurant: string;
  is_open: boolean;
  prep_minutes: number | null;
  subtotal: number;
  items: {
    menu_item_id: string;
    name: string;
    quantity: number;
    price: number;
  }[];
}

export interface DeliveryQuote {
  shop_count: number;
  subtotal: number;
  /** The destination's own delivery rate, without the extra-shop surcharge. */
  base_delivery_fee: number;
  /** The whole delivery fee: the rate plus 10.00 per extra shop (0092). */
  delivery_fee: number;
  service_fee: number;
  total: number;
  fee_agreed_in_person?: boolean;
  unknown_barangay?: boolean;
  shops: QuotedShop[];
}

export interface PlaceDeliveryResult {
  delivery_id: string;
  reference: string;
  order_ids: string[];
  total: number;
  status: string;
}

/**
 * The per-shop rows of a quote, mapped field by field.
 *
 * The RPC returns the shops as jsonb, so the generated type says `Json`. The
 * screen needs a name, a subtotal and a line list per shop, and a hand-edited
 * or truncated row must not become `undefined` halfway down a list.
 */
function mapQuotedShops(value: unknown): QuotedShop[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (entry === null || typeof entry !== "object") return [];
    const shop = entry as Record<string, unknown>;
    if (typeof shop.restaurant_id !== "string") return [];
    const items = Array.isArray(shop.items) ? shop.items : [];
    return [
      {
        restaurant_id: shop.restaurant_id,
        restaurant: typeof shop.restaurant === "string" ? shop.restaurant : "",
        is_open: shop.is_open !== false,
        prep_minutes: typeof shop.prep_minutes === "number" ? shop.prep_minutes : null,
        subtotal: typeof shop.subtotal === "number" ? shop.subtotal : 0,
        items: items.flatMap((item) => {
          if (item === null || typeof item !== "object") return [];
          const row = item as Record<string, unknown>;
          if (typeof row.menu_item_id !== "string") return [];
          return [
            {
              menu_item_id: row.menu_item_id,
              name: typeof row.name === "string" ? row.name : "",
              quantity: typeof row.quantity === "number" ? row.quantity : 0,
              price: typeof row.price === "number" ? row.price : 0,
            },
          ];
        }),
      },
    ];
  });
}

/**
 * Server-authoritative price preview for a basket with food from several
 * shops (0092).
 *
 * The delivery fee is the destination's rate plus 10.00 for every shop after
 * the first, and the service fee is charged once for the whole checkout. The
 * screen shows that split; the numbers come from here, never from the app.
 */
export async function quoteDelivery(args: {
  shops: QuoteShop[];
  /** Destination, so the quoted fee is the zonal one the trip will charge. */
  barangay?: string | null;
}): Promise<DeliveryQuote> {
  const { data, error } = await supabase.rpc("quote_delivery", {
    p_shops: args.shops,
    p_delivery_barangay: args.barangay ?? undefined,
  });
  if (error) throw error;
  if (!data || data.length !== 1) {
    throw new Error("Could not price this cart. Try again.");
  }
  const row = data[0];
  return { ...row, shops: mapQuotedShops(row.shops) };
}

/**
 * Place the whole basket as one trip (0092).
 *
 * Server-side priced + minted: the client never sends a total. Idempotent on
 * the request id, so a retry after a lost response returns the trip that
 * landed instead of placing a second one.
 */
export async function placeDelivery(args: {
  shops: QuoteShop[];
  deliveryAddress: string;
  payment: PaymentChoice;
  /** Same value on every retry of one checkout. */
  requestId: string;
  /** Required by the server once service_areas is published (0077). */
  barangay?: string | null;
}): Promise<PlaceDeliveryResult> {
  const { data, error } = await supabase.rpc("customer_place_delivery", {
    p_shops: args.shops,
    p_delivery_address: args.deliveryAddress,
    p_payment: args.payment,
    p_client_request_id: args.requestId,
    p_delivery_barangay: args.barangay ?? undefined,
  });
  if (error) throw error;
  if (!data || data.length !== 1) {
    throw new Error("Order was not placed. Try again.");
  }

  // One call for the whole trip: the route tells each shop about its own part
  // and the customer about the basket. A call per shop would also run the
  // customer into the route's rate limit on a ten-shop basket.
  void postApi("/api/orders/notify", {
    deliveryId: data[0].delivery_id,
    event: "placed",
  });

  return data[0];
}

/**
 * One shop's part of a trip, as the tracker shows it.
 *
 * A trip may hold food from several shops (0092): each one has its own status,
 * and the customer watches all of them at once.
 */
export interface TrackedDeliveryStop {
  order_id: string;
  reference: string;
  restaurant: string;
  items: {
    menu_item_id: string;
    name: string;
    quantity: number;
    price: number;
  }[];
  subtotal: number;
  status: string;
}

export interface TrackedDelivery {
  reference: string;
  customer: string;
  delivery_address: string | null;
  delivery_barangay: string | null;
  payment: PaymentChoice;
  subtotal: number;
  base_delivery_fee: number;
  delivery_fee: number;
  service_fee: number;
  total: number;
  status: string;
  placed_at: string;
  rider: string | null;
  stops: TrackedDeliveryStop[];
}

/**
 * Track a trip by its reference (0092).
 *
 * Returns null when the reference is not a trip, so the screen can fall back
 * to the single-shop order it has always shown.
 */
export async function fetchTrackedDelivery(
  reference: string
): Promise<TrackedDelivery | null> {
  const { data, error } = await supabase.rpc("track_delivery", {
    p_reference: reference,
  });
  if (error) throw error;
  if (!data || data.length === 0) return null;
  const row = data[0];
  const stops = Array.isArray(row.stops) ? row.stops : [];
  return {
    reference: row.reference,
    customer: row.customer,
    delivery_address: row.delivery_address ?? null,
    delivery_barangay: row.delivery_barangay ?? null,
    payment: row.payment,
    subtotal: Number(row.subtotal),
    base_delivery_fee: Number(row.base_delivery_fee),
    delivery_fee: Number(row.delivery_fee),
    service_fee: Number(row.service_fee),
    total: Number(row.total),
    status: row.status,
    placed_at: row.placed_at,
    rider: row.rider ?? null,
    stops: stops.flatMap((stop) => {
      if (stop === null || typeof stop !== "object") return [];
      const shop = stop as Record<string, unknown>;
      if (typeof shop.order_id !== "string") return [];
      const items = Array.isArray(shop.items) ? shop.items : [];
      return [
        {
          order_id: shop.order_id,
          reference: typeof shop.reference === "string" ? shop.reference : "",
          restaurant: typeof shop.restaurant === "string" ? shop.restaurant : "",
          subtotal: typeof shop.subtotal === "number" ? shop.subtotal : 0,
          status: typeof shop.status === "string" ? shop.status : "pending",
          items: items.flatMap((item) => {
            if (item === null || typeof item !== "object") return [];
            const row2 = item as Record<string, unknown>;
            if (typeof row2.menu_item_id !== "string") return [];
            return [
              {
                menu_item_id: row2.menu_item_id,
                name: typeof row2.name === "string" ? row2.name : "",
                quantity: typeof row2.quantity === "number" ? row2.quantity : 0,
                price: typeof row2.price === "number" ? row2.price : 0,
              },
            ];
          }),
        },
      ];
    }),
  };
}

/**
 * A trip the rider is carrying (0092).
 *
 * One basket from several shops: one address, one drop-off, one amount to
 * collect. The stops are fetched separately, per trip.
 */
export interface RiderDelivery {
  delivery_id: string;
  reference: string;
  customer: string;
  delivery_address: string;
  customer_phone: string;
  shops: number;
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  total: number;
  status: string;
  /** Cash to collect, or a GCash scan to expect. */
  payment: PaymentChoice;
  placed_at: string;
}

/** One shop's stop in a trip. */
export interface DeliveryStop {
  order_id: string;
  reference: string;
  restaurant: string;
  restaurant_id: string;
  items: {
    menu_item_id: string;
    name: string;
    quantity: number;
    price: number;
  }[];
  subtotal: number;
  status: string;
}

/**
 * A trip offered to the rider (0092).
 *
 * One basket from several shops is ONE offer: the rider takes the whole trip
 * or none of it, so it is not offered shop by shop.
 */
export interface RiderDeliveryOffer {
  offerId: number;
  deliveryId: string;
  reference: string;
  customer: string;
  deliveryAddress: string;
  customerPhone: string;
  shops: number;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  /** What the rider earns per stop (0092: payout is per stop). */
  payoutPerStop: number;
  city: string;
  offeredAt: string;
  expiresAt: string;
}

/** The trips offered to the signed-in rider. */
export async function fetchRiderDeliveryOffers(): Promise<RiderDeliveryOffer[]> {
  const { data, error } = await supabase.rpc("fetch_rider_delivery_offers");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    offerId: row.offer_id,
    deliveryId: row.delivery_id,
    reference: row.reference,
    customer: row.customer,
    deliveryAddress: row.delivery_address ?? "",
    customerPhone: row.customer_phone ?? "",
    shops: row.shops,
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    serviceFee: Number(row.service_fee),
    total: Number(row.total),
    payoutPerStop: Number(row.payout_per_stop),
    city: row.city ?? "",
    offeredAt: row.offered_at,
    expiresAt: row.expires_at,
  }));
}

/**
 * Accept a whole trip (0092).
 *
 * One rider takes every shop in the basket: the claim freezes the payout per
 * stop and hands back the stops to collect.
 */
export async function claimDelivery(
  deliveryId: string
): Promise<{ reference: string; rider_payout: number }> {
  const { data, error } = await supabase.rpc("claim_delivery", {
    p_delivery_id: deliveryId,
  });
  if (error) throw error;
  if (!data || data.length !== 1) {
    throw new Error("That delivery is no longer available.");
  }
  return data[0];
}

/** Turn a trip down (0092). A decline sticks: the rider is not asked again. */
export async function declineDelivery(
  deliveryId: string,
  reason?: string
): Promise<void> {
  const { error } = await supabase.rpc("decline_delivery", {
    p_delivery_id: deliveryId,
    p_reason: reason ?? undefined,
  });
  if (error) throw error;
}

/** The trips assigned to the signed-in rider. */
export async function fetchRiderDeliveries(): Promise<RiderDelivery[]> {
  const { data, error } = await supabase.rpc("rider_my_deliveries", {
    p_limit: 20,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    delivery_id: row.delivery_id,
    reference: row.reference,
    customer: row.customer,
    delivery_address: row.delivery_address ?? "",
    customer_phone: row.customer_phone ?? "",
    shops: row.shops,
    subtotal: Number(row.subtotal),
    delivery_fee: Number(row.delivery_fee),
    service_fee: Number(row.service_fee),
    total: Number(row.total),
    status: row.status,
    payment: row.payment as PaymentChoice,
    placed_at: row.placed_at,
  }));
}

/** The shops of a trip, for the rider's trip screen. */
export async function fetchDeliveryStops(deliveryId: string): Promise<DeliveryStop[]> {
  const { data, error } = await supabase.rpc("delivery_stops", {
    p_delivery_id: deliveryId,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    order_id: row.order_id,
    reference: row.reference,
    restaurant: row.restaurant,
    restaurant_id: row.restaurant_id ?? "",
    subtotal: Number(row.subtotal),
    status: row.status,
    items: (parseOrderItems(row.items) ?? []).map((item) => ({
      menu_item_id: item.menu_item_id ?? "",
      name: item.name,
      quantity: item.quantity,
      price: Number(item.price),
    })),
  }));
}

/**
 * Give a whole trip back (0092).
 *
 * The trip and its shops go back to confirmed with no rider, and it is offered
 * again -- to a different rider, because the one who gave up is not asked twice.
 */
export async function reportFailedDeliveryTrip(
  deliveryId: string,
  reason: string
): Promise<void> {
  const { error } = await supabase.rpc("rider_report_failed_delivery_trip", {
    p_delivery_id: deliveryId,
    p_reason: reason,
  });
  if (error) throw error;
}

/**
 * Cancel the caller's own order. The server allows it only while the order is
 * still pending (0076) and only for the order's customer, so the error message
 * is the source of truth for "too late".
 */
export async function cancelOrder(orderId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId });
  if (error) throw error;
}

export interface OrderRating {
  order_id: string;
  restaurant_rating: number;
  rider_rating: number | null;
  comment: string | null;
}

/** The caller's own ratings, keyed by order id via the list. */
export async function fetchMyRatings(): Promise<OrderRating[]> {
  const { data, error } = await supabase.rpc("my_ratings");
  if (error) throw error;
  return (data ?? []) as OrderRating[];
}

/**
 * Rate a delivered order. The server enforces ownership, delivered status, and
 * the 1-5 range, so its error is shown rather than pre-empted.
 */
export async function rateOrder(args: {
  orderId: string;
  restaurantRating: number;
  riderRating?: number | null;
  comment?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("rate_order", {
    p_order_id: args.orderId,
    p_restaurant_rating: args.restaurantRating,
    // Optional args default to null in SQL; omit rather than pass null.
    p_rider_rating: args.riderRating ?? undefined,
    p_comment: args.comment ?? undefined,
  });
  if (error) throw error;
}

/**
 * The applicant's own application, or null if they have never applied. The
 * status is what drives the screen: pending shows "we are reviewing it",
 * approved means they can open the rider app, rejected shows the note and an
 * apply-again button.
 */
export interface RiderApplication {
  id: string;
  status: "pending" | "approved" | "rejected";
  fullName: string;
  phone: string;
  city: string;
  vehicle: VehicleType;
  licenceRef: string | null;
  orcrRef: string | null;
  governmentIdRef: string | null;
  decisionNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export async function fetchMyRiderApplication(): Promise<RiderApplication | null> {
  const { data, error } = await supabase.rpc("my_rider_application");
  if (error) throw error;

  // RETURNS TABLE with limit 1, so this arrives as a zero- or one-element array
  // rather than a single object, and gen-types cannot infer that. Same mapping
  // rather than cast as fetchRiderOrdersPage.
  const row = ((data ?? []) as unknown as Record<string, unknown>[])[0];
  if (!row) return null;

  return {
    id: String(row.id),
    status: String(row.status) as RiderApplication["status"],
    fullName: String(row.full_name),
    phone: String(row.phone),
    city: String(row.city),
    vehicle: String(row.vehicle) as VehicleType,
    licenceRef: (row.licence_ref as string | null) ?? null,
    orcrRef: (row.orcr_ref as string | null) ?? null,
    governmentIdRef: (row.government_id_ref as string | null) ?? null,
    decisionNote: (row.decision_note as string | null) ?? null,
    createdAt: String(row.created_at),
    reviewedAt: (row.reviewed_at as string | null) ?? null,
  };
}

/**
 * Apply to deliver. Idempotent server-side, so a retry after a dropped
 * connection cannot create a duplicate application.
 */
export async function submitRiderApplication(args: {
  fullName: string;
  phone: string;
  city?: string | null;
  vehicle: VehicleType;
  licenceRef?: string | null;
  orcrRef?: string | null;
  governmentIdRef?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("submit_rider_application", {
    p_full_name: args.fullName,
    p_phone: args.phone,
    // Optional args default to null in SQL; omit rather than pass null.
    p_city: args.city ?? undefined,
    p_vehicle: args.vehicle,
    p_licence_ref: args.licenceRef ?? undefined,
    p_orcr_ref: args.orcrRef ?? undefined,
    p_government_id_ref: args.governmentIdRef ?? undefined,
  });
  if (error) throw error;
  return String(data ?? "");
}

/** Barangays KFD delivers to. Empty while the owner has not published the list (0077). */
export async function fetchServiceAreas(): Promise<string[]> {
  const { data, error } = await supabase
    .from("service_areas")
    .select("barangay")
    .order("barangay");
  if (error) throw error;
  return (data ?? []).map((r) => r.barangay);
}

/**
 * Delete the signed-in customer's account (0077). The server refuses while an
 * order is in flight and for rider or merchant accounts; its message says why.
 */
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc("delete_my_account");
  if (error) throw error;
}

/**
 * A rider asks for their account to be deleted (0082). Staff close it after
 * settling payouts and cash, so this records the request rather than deleting.
 * Returns when it was first asked; asking again keeps that time.
 */
export async function requestRiderAccountDeletion(): Promise<string> {
  const { data, error } = await supabase.rpc("rider_request_account_deletion");
  if (error) throw error;
  return String(data);
}

export interface RiderContact {
  riderName: string;
  riderPhone: string | null;
}

/**
 * The assigned rider's name and phone, for the order's own customer while the
 * order is in progress (0078). Null otherwise, so the screen shows no buttons.
 */
export async function fetchRiderContact(
  reference: string
): Promise<RiderContact | null> {
  const { data, error } = await supabase.rpc("order_rider_contact", {
    p_reference: reference,
  });
  if (error) throw error;
  const row = data?.[0];
  return row
    ? { riderName: row.rider_name, riderPhone: row.rider_phone ?? null }
    : null;
}

/** Total refunded per order id, for the signed-in customer's orders (RLS, 0078). */
export async function fetchMyRefunds(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("order_refunds")
    .select("order_id, amount");
  if (error) throw error;
  const totals: Record<string, number> = {};
  for (const r of data ?? [])
    totals[r.order_id] = (totals[r.order_id] ?? 0) + Number(r.amount);
  return totals;
}

/** Restaurant ids the signed-in customer saved (0078). */
export async function fetchFavorites(): Promise<string[]> {
  const { data, error } = await supabase
    .from("customer_favorites")
    .select("restaurant_id");
  if (error) throw error;
  return (data ?? []).map((r) => r.restaurant_id);
}

export async function setFavorite(
  restaurantId: string,
  favorite: boolean
): Promise<void> {
  const { error } = favorite
    ? await supabase.from("customer_favorites").insert({ restaurant_id: restaurantId })
    : await supabase
        .from("customer_favorites")
        .delete()
        .eq("restaurant_id", restaurantId);
  // A double tap inserting twice is already the state we want.
  if (error && error.code !== "23505") throw error;
}
