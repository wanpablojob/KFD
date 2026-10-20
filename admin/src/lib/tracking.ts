import { supabase } from "./supabase/client";
import type { OrderItem, OrderStatus, PaymentMethod } from "./types";

/**
 * Customer-facing order tracking.
 *
 * Everything here is read through public.track_order(), a security definer
 * function, and never through the orders table. That is not a stylistic
 * preference:
 *
 *   RLS filters rows, never columns.
 *
 * The anon key ships in the browser bundle, so any anon-readable row of
 * `orders` is fully readable -- customer names, rider assignments, restaurant
 * ids, cancellation reasons and all -- no matter which columns this file asks
 * for. 0012 therefore revokes anon's grant on orders entirely and exposes one
 * function whose return type is the list of things the public may see. Adding a
 * column to that type is the deliberate, reviewable act of publishing more.
 *
 * Trackability is decided by the shape of the reference, not by a flag on the
 * row: 0012 only serves references matching ^#KFD-[0-9A-F]{12}$, 48 bits, and
 * the seeded #KFD-10NN references are deliberately not trackable. See the
 * migration for the enumeration-oracle reasoning.
 */
export interface TrackedOrder {
  reference: string;
  restaurant: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  payment: PaymentMethod;
  placedAt: string;
}

/** Statuses that will not change again, so polling can stop. */
const TERMINAL: OrderStatus[] = ["delivered", "cancelled"];

export function isTerminal(status: OrderStatus | null): boolean {
  return status !== null && TERMINAL.includes(status);
}

/** A trip (0092): one basket from several shops, one delivery. */
export interface TrackedDelivery {
  reference: string;
  customer: string;
  deliveryAddress: string | null;
  deliveryBarangay: string | null;
  payment: PaymentMethod;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  status: string;
  placedAt: string;
  rider: string | null;
  stops: {
    order_id: string;
    reference: string;
    restaurant: string;
    items: OrderItem[];
    subtotal: number;
    status: OrderStatus;
  }[];
}

/**
 * Track a trip by its reference (0092).
 *
 * A customer is given the TRIP's reference, so the public tracker has to
 * understand it: the same posture as track_order -- a fixed projection, and
 * the address only for the customer who ordered it.
 */
export async function fetchTrackedDelivery(
  reference: string
): Promise<TrackedDelivery | null> {
  const { data, error } = await supabase.rpc("track_delivery", {
    p_reference: reference,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;

  const stops = Array.isArray(row.stops) ? row.stops : [];
  return {
    reference: row.reference,
    customer: row.customer,
    deliveryAddress: row.delivery_address ?? null,
    deliveryBarangay: row.delivery_barangay ?? null,
    payment: row.payment,
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    serviceFee: Number(row.service_fee),
    total: Number(row.total),
    status: row.status,
    placedAt: row.placed_at,
    rider: row.rider ?? null,
    stops: stops.flatMap((stop) => {
      if (stop === null || typeof stop !== "object") return [];
      const shop = stop as Record<string, unknown>;
      if (typeof shop.order_id !== "string") return [];
      return [
        {
          order_id: shop.order_id,
          reference: typeof shop.reference === "string" ? shop.reference : "",
          restaurant: typeof shop.restaurant === "string" ? shop.restaurant : "",
          items: Array.isArray(shop.items)
            ? (shop.items as unknown as OrderItem[])
            : [],
          subtotal: Number(shop.subtotal),
          status: shop.status as OrderStatus,
        },
      ];
    }),
  };
}

export async function fetchTrackedOrder(
  reference: string
): Promise<TrackedOrder | null> {
  const { data, error } = await supabase.rpc("track_order", {
    p_reference: reference,
  });

  // A reference that does not exist and one that exists but is not publicly
  // trackable both come back as zero rows, by design: distinguishing them would
  // turn the page into a test for whether a reference is real.
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;

  return {
    reference: row.reference,
    restaurant: row.restaurant,
    // `items` is a jsonb column, so it arrives as `Json`. The shape is written
    // by customer_place_order() and mirrored by OrderItem, but jsonb carries no
    // compile-time contract, hence the hop through unknown.
    items: Array.isArray(row.items) ? (row.items as unknown as OrderItem[]) : [],
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    total: Number(row.total),
    status: row.status,
    payment: row.payment,
    placedAt: row.placed_at,
  };
}
