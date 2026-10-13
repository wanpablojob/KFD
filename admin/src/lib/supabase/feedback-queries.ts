import { supabase } from "./client";

/**
 * Refunds and ratings (0078). Row Level Security scopes both: admins read all
 * refunds and ratings, merchants read their own restaurant's ratings.
 */

export interface Refund {
  id: number;
  amount: number;
  method: "cash" | "gcash";
  reason: string;
  created_at: string;
}

export async function fetchOrderRefunds(orderId: string): Promise<Refund[]> {
  const { data, error } = await supabase
    .from("order_refunds")
    .select("id, amount, method, reason, created_at")
    .eq("order_id", orderId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) }) as Refund);
}

/** The server refuses anything that would refund more than the order total. */
export async function recordRefund(
  orderId: string,
  amount: number,
  method: Refund["method"],
  reason: string
): Promise<void> {
  const { error } = await supabase.rpc("admin_record_refund", {
    p_order_id: orderId,
    p_amount: amount,
    p_method: method,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

export interface Rating {
  order_id: string;
  restaurant_rating: number;
  rider_rating: number | null;
  comment: string | null;
  created_at: string;
}

/** Newest ratings, for one restaurant (admin) or the merchant's own (RLS). */
export async function fetchRecentRatings(restaurantId?: string): Promise<Rating[]> {
  let query = supabase
    .from("order_ratings")
    .select("order_id, restaurant_rating, rider_rating, comment, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  if (restaurantId) query = query.eq("restaurant_id", restaurantId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}
