import { supabase } from "./supabase";

export interface RestaurantRow {
  id: string;
  name: string;
  cuisine: string;
  city: string;
  rating: number;
  status: string;
  archived_at: string | null;
}

export interface MenuItemRow {
  id: string;
  restaurant: string;
  restaurant_id: string;
  name: string;
  category: string;
  price: number;
  available: boolean;
}

/** Restaurants surfaced to customers: active and not archived (RLS enforces). */
export async function fetchActiveRestaurants(): Promise<RestaurantRow[]> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("id, name, cuisine, city, rating, status, archived_at")
    .eq("status", "active")
    .is("archived_at", null)
    .order("name");
  if (error) throw error;
  return data ?? [];
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
    .select("id, restaurant, restaurant_id, name, category, price, available")
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
}

/**
 * orders.items is jsonb, so the schema types it as `Json` and nothing downstream
 * can trust it. customer_place_order writes {name, quantity, price} per line,
 * so parse that and drop anything that does not fit rather than casting the
 * array and pretending. Same guard as the admin dispatch list.
 */
function parseOrderItems(value: unknown): OrderLine[] {
  if (!Array.isArray(value)) return [];
  const lines: OrderLine[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object") continue;
    const { name, quantity, price } = entry as Record<string, unknown>;
    if (typeof name !== "string" || typeof quantity !== "number") continue;
    lines.push({ name, quantity, price: typeof price === "number" ? price : 0 });
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

  // Same reason as fetchRiderOrdersPage: gen-types cannot infer nullability for
  // a RETURNS TABLE, so nullable columns are mapped rather than cast over.
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
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
  }));
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

/** Decline an offer. The system offers it to the next rider in rotation. */
export async function declineRiderOffer(orderId: string): Promise<void> {
  const { error } = await supabase.rpc("decline_order", { p_order_id: orderId });
  if (error) throw error;
}

/** Cursor-paginated orders for the calling rider. */
export async function fetchRiderOrdersPage(
  cursor: string | null,
  limit = 20
): Promise<RiderOrderPageResult> {
  const { data, error } = await supabase.rpc("fetch_rider_orders_page", {
    p_cursor: cursor,
    p_limit: limit,
  });
  if (error) throw error;

  // gen-types cannot infer nullability for a RETURNS TABLE, so it hands back
  // every column as non-null. customer_phone, delivery_address, rider_payout and
  // next_cursor are all genuinely nullable, which is why this maps explicitly
  // instead of casting the rows into RiderOrderPageItem[] and lying about it.
  const rows: RiderOrderPageItem[] = (data ?? []).map((row) => ({
    id: row.id,
    reference: row.reference,
    customer: row.customer,
    customer_phone: row.customer_phone ?? null,
    restaurant: row.restaurant,
    delivery_address: row.delivery_address ?? null,
    items: parseOrderItems(row.items),
    total: row.total,
    rider_payout: row.rider_payout ?? null,
    status: row.status,
    payment: row.payment,
    placed_at: row.placed_at,
    next_cursor: row.next_cursor ?? null,
  }));

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

/** One completed delivery and what it was worth. */
export interface RiderPayoutRow {
  order_id: string;
  order_reference: string;
  restaurant: string;
  amount: number;
  earned_at: string;
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
}

/** The calling rider's own row (RLS scopes it to user_id = auth.uid()). */
export async function fetchRiderProfile(userId: string): Promise<RiderProfile | null> {
  const { data, error } = await supabase
    .from("riders")
    .select("id, name, city, vehicle, status, deliveries, rating, earnings")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as RiderProfile | null) ?? null;
}

export interface CustomerOrder {
  reference: string;
  restaurant: string;
  items: { name: string; quantity: number; price: number }[];
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  total: number;
  status: string;
  payment: string;
  placed_at: string;
  delivery_address: string | null;
}

/** This customer's own orders, newest first (RLS: customer_user_id = auth.uid()). */
export async function fetchMyOrders(): Promise<CustomerOrder[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "reference, restaurant, items, subtotal, delivery_fee, service_fee, total, status, payment, placed_at, delivery_address"
    )
    .order("placed_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as CustomerOrder[];
}

export interface PlaceOrderItem {
  menu_item_id: string;
  quantity: number;
}

export type PaymentChoice = "cash" | "card" | "e_wallet";

export interface OrderQuote {
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  total: number;
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
}): Promise<OrderQuote> {
  const { data, error } = await supabase.rpc("quote_order", {
    p_restaurant_id: args.restaurantId,
    p_items: args.items,
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
}): Promise<PlaceOrderResult> {
  const { data, error } = await supabase.rpc("customer_place_order", {
    p_restaurant_id: args.restaurantId,
    p_items: args.items,
    p_delivery_address: args.deliveryAddress,
    p_payment: args.payment,
  });
  if (error) throw error;
  if (!data || data.length !== 1) {
    throw new Error("Order was not placed. Try again.");
  }
  return data[0];
}
