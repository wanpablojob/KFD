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
