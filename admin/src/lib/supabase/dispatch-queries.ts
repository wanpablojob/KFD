import { supabase } from "./client";

/**
 * Dispatch: the admin side of rider assignment.
 *
 * Until migration 0035 there was no way to give an order to a rider, so the
 * rider app's queue was structurally always empty. Every function here is
 * SECURITY DEFINER and re-checks the admin role itself; the guards are not
 * optional and are not implied by RLS.
 *
 * Types come straight from `supabase gen types`, so a changed return table in
 * the migration surfaces as a type error rather than as `undefined` at runtime.
 * There are no `as` casts in this file by design.
 */

export interface UnassignedOrder {
  orderId: string;
  reference: string;
  customer: string;
  restaurant: string;
  restaurantId: string;
  city: string;
  deliveryAddress: string;
  items: OrderLine[];
  total: number;
  status: string;
  placedAt: string;
  liveOffers: number;
  offersMade: number;
  declines: number;
  onlineRidersInCity: number;
}

export interface DispatchRider {
  riderId: string;
  name: string;
  phone: string | null;
  city: string;
  vehicle: string;
  status: string;
  deliveries: number;
  rating: number;
  activeOffers: number;
  claimedToday: number;
}

export interface OrderLine {
  name: string;
  quantity: number;
  price: number;
}

/**
 * orders.items is jsonb, so the schema types it as `Json` and nothing downstream
 * can trust its shape. customer_place_order writes {name, quantity, price} per
 * line (0023), so parse that and drop anything that does not fit rather than
 * casting the whole array and pretending.
 */
function parseItems(value: unknown): OrderLine[] {
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

/** Orders with no rider yet. Nothing expires these automatically. */
export async function fetchUnassignedOrders(): Promise<UnassignedOrder[]> {
  const { data, error } = await supabase.rpc("dispatch_unassigned_orders");
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    orderId: row.order_id,
    reference: row.reference,
    customer: row.customer,
    restaurant: row.restaurant,
    restaurantId: row.restaurant_id,
    city: row.city,
    deliveryAddress: row.delivery_address ?? "",
    items: parseItems(row.items),
    total: Number(row.total),
    status: row.status,
    placedAt: row.placed_at,
    liveOffers: row.live_offers,
    offersMade: row.offers_made,
    declines: row.declines,
    onlineRidersInCity: row.online_riders_in_city,
  }));
}

/** Riders with live-offer and workload counts, online first. */
export async function fetchDispatchRiders(): Promise<DispatchRider[]> {
  const { data, error } = await supabase.rpc("dispatch_riders");
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    riderId: row.rider_id,
    name: row.name,
    phone: row.phone,
    city: row.city,
    vehicle: row.vehicle,
    status: row.status,
    deliveries: row.deliveries,
    rating: Number(row.rating),
    activeOffers: row.active_offers,
    claimedToday: row.claimed_today,
  }));
}

/**
 * Offers an order to riders.
 *
 * Omit `riderIds` to hit every online rider in the restaurant's city, which is
 * the normal path. Pass ids to target specific riders. Returns how many offers
 * are now live, which is 0 when nobody online qualifies — worth surfacing
 * rather than silently doing nothing.
 */
export async function dispatchOrder(
  orderId: string,
  riderIds?: string[] | null,
): Promise<number> {
  // The parameter defaults to null, so gen-types marks it optional. Omitting the
  // key is how "no preference, use the city" is expressed; sending an explicit
  // null is a different thing to the generated type and is not worth a cast.
  const args: { p_order_id: string; p_rider_ids?: string[] } = { p_order_id: orderId };
  if (riderIds && riderIds.length > 0) args.p_rider_ids = riderIds;

  const { data, error } = await supabase.rpc("admin_dispatch_order", args);
  if (error) throw new Error(error.message);
  return data?.[0]?.offered_to ?? 0;
}