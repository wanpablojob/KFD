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

export interface RiderOrderPageItem {
  id: string;
  reference: string;
  customer: string;
  restaurant: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  status: string;
  payment: string;
  placed_at: string;
  next_cursor: string | null;
}

export interface RiderOrderPageResult {
  items: RiderOrderPageItem[];
  nextCursor: string | null;
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
  const rows = (data ?? []) as (RiderOrderPageItem & { next_cursor: string | null })[];
  // All rows in a page have the same next_cursor (from the window function)
  const nextCursor = rows[0]?.next_cursor ?? null;
  return { items: rows, nextCursor };
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
