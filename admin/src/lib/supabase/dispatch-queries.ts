import { supabase } from "./client";

/**
 * Dispatch: offering an order to riders.
 *
 * Normally automatic since 0085: a restaurant accepting an order offers it to
 * every eligible rider. What is left here is the admin override (re-offer an
 * order whose offers lapsed) and the rider alert both paths send.
 */

/**
 * Re-offers an order to riders. admin_dispatch_order re-checks the admin role.
 *
 * Omitting `riderIds` hits every online rider in the restaurant's city, the
 * normal path. Returns how many offers are now live, which is 0 when nobody
 * online qualifies -- worth surfacing rather than silently doing nothing.
 */
export async function dispatchOrder(
  orderId: string,
  riderIds?: string[] | null,
): Promise<number> {
  // The parameter defaults to null, so gen-types marks it optional. Omitting the
  // key is how "no preference, use the city" is expressed.
  const args: { p_order_id: string; p_rider_ids?: string[] } = { p_order_id: orderId };
  if (riderIds && riderIds.length > 0) args.p_rider_ids = riderIds;

  const { data, error } = await supabase.rpc("admin_dispatch_order", args);
  if (error) throw new Error(error.message);
  return data?.[0]?.offered_to ?? 0;
}

/**
 * The trips waiting for a rider (0093).
 *
 * A trip is dispatched as a whole: one rider collects from every shop in the
 * basket and delivers it in one trip.
 */
export interface PendingDelivery {
  deliveryId: string;
  reference: string;
  customer: string;
  shops: number;
  subtotal: number;
  total: number;
  status: string;
  city: string;
  placedAt: string;
}

export async function fetchPendingDeliveries(): Promise<PendingDelivery[]> {
  const { data, error } = await supabase.rpc("admin_pending_deliveries");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    deliveryId: row.delivery_id,
    reference: row.reference,
    customer: row.customer,
    shops: row.shops,
    subtotal: Number(row.subtotal),
    total: Number(row.total),
    status: row.status,
    city: row.city ?? "",
    placedAt: row.placed_at,
  }));
}

/**
 * Re-offers a whole trip to riders (0093).
 *
 * The trip's counterpart to dispatchOrder: the same safety net under
 * auto-dispatch, for a basket from several shops.
 */
export async function dispatchDelivery(
  deliveryId: string,
  riderIds?: string[] | null,
): Promise<number> {
  const args: { p_delivery_id: string; p_rider_ids?: string[] } = {
    p_delivery_id: deliveryId,
  };
  if (riderIds && riderIds.length > 0) args.p_rider_ids = riderIds;

  const { data, error } = await supabase.rpc("admin_dispatch_delivery", args);
  if (error) throw new Error(error.message);
  return data?.[0]?.offered_to ?? 0;
}

/**
 * Push-alert the riders a trip was just offered to (0093).
 */
export async function notifyRidersOfDeliveryOffer(
  deliveryId: string,
): Promise<OfferAlert> {
  const fallback: OfferAlert = { notified: 0, windowSeconds: null };
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return fallback;

    const res = await fetch("/api/dispatch/notify", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryId }),
    });
    if (!res.ok) return fallback;
    const body = (await res.json()) as Partial<OfferAlert>;
    return { notified: body.notified ?? 0, windowSeconds: body.windowSeconds ?? null };
  } catch {
    return fallback;
  }
}

export interface OfferAlert {
  notified: number;
  windowSeconds: number | null;
}

/**
 * Push-alert the riders an order was just offered to.
 *
 * Best-effort by contract: the offers are live whether or not the push lands,
 * so a failure returns zero notified rather than throwing. A Postgres trigger
 * cannot send a push, which is why the merchant portal (on acceptance) and the
 * admin (on re-offer) call this after the write succeeds.
 */
export async function notifyRidersOfOffer(orderId: string): Promise<OfferAlert> {
  const fallback: OfferAlert = { notified: 0, windowSeconds: null };
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return fallback;

    const res = await fetch("/api/dispatch/notify", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    if (!res.ok) return fallback;
    const body = (await res.json()) as Partial<OfferAlert>;
    return { notified: body.notified ?? 0, windowSeconds: body.windowSeconds ?? null };
  } catch {
    return fallback;
  }
}
