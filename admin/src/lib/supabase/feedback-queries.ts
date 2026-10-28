import { supabase } from "./client";
import { notifyAdminDecision } from "./admin-notify";
import { fetchAll } from "@/lib/fetch-all";
import type { DateRange } from "@/lib/types";
import type { RefundEntry } from "@/lib/refund-ledger";
import type { ReviewEntry } from "@/lib/review-metrics";

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
  const { data, error } = await supabase.rpc("admin_record_refund", {
    p_order_id: orderId,
    p_amount: amount,
    p_method: method,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  const refundId = data?.[0]?.id;
  if (refundId !== undefined) void notifyAdminDecision("refund", refundId);
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

/**
 * Every refund, newest first, carrying the order it belongs to.
 *
 * The order embed is what makes the ledger readable: a refund row on its own
 * has an opaque `order_id`, and opening each order to find out who and which
 * shop is the work this page removes. Admin RLS allows both tables; a merchant
 * only ever sees their own rows, and the page is hidden for them anyway.
 */
type RefundLedgerRow = {
  id: number;
  order_id: string;
  amount: number;
  method: string;
  reason: string;
  created_at: string;
  orders: { reference: string; customer: string; restaurant: string } | null;
};

export async function fetchRefunds(range?: DateRange): Promise<RefundEntry[]> {
  // Paged: a refund ledger is an export, and PostgREST stops silently at the
  // project's max-rows.
  const rows = await fetchAll<RefundLedgerRow>((from, to) => {
    let query = supabase
      .from("order_refunds")
      .select(
        "id, order_id, amount, method, reason, created_at, orders(reference, customer, restaurant)",
      )
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to);
    if (range?.from) query = query.gte("created_at", range.from);
    if (range?.to) query = query.lte("created_at", range.to + "T23:59:59.999Z");
    return query.returns<RefundLedgerRow[]>();
  });

  return rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    reference: row.orders?.reference ?? row.order_id,
    customer: row.orders?.customer ?? "—",
    restaurant: row.orders?.restaurant ?? "—",
    amount: Number(row.amount),
    method: row.method === "cash" ? "cash" : "gcash",
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

/**
 * Every rating, newest first, carrying the order it belongs to.
 *
 * `restaurant_id` is nullable (the FK is ON DELETE SET NULL), so a shop that
 * was deleted leaves the order's own restaurant name as the only label. The
 * order embed is preferred; the id is the fallback, never a blank cell.
 */
type ReviewRow = {
  order_id: string;
  restaurant_rating: number;
  rider_rating: number | null;
  comment: string | null;
  created_at: string;
  restaurant_id: string | null;
  orders: { reference: string; customer: string; restaurant: string } | null;
};

export async function fetchRatings(range?: DateRange): Promise<ReviewEntry[]> {
  const rows = await fetchAll<ReviewRow>((from, to) => {
    let query = supabase
      .from("order_ratings")
      .select(
        "order_id, restaurant_rating, rider_rating, comment, created_at, restaurant_id, orders(reference, customer, restaurant)",
      )
      .order("created_at", { ascending: false })
      .order("order_id")
      .range(from, to);
    if (range?.from) query = query.gte("created_at", range.from);
    if (range?.to) query = query.lte("created_at", range.to + "T23:59:59.999Z");
    return query.returns<ReviewRow[]>();
  });

  return rows.map((row) => ({
    orderId: row.order_id,
    reference: row.orders?.reference ?? row.order_id,
    customer: row.orders?.customer ?? "—",
    restaurant: row.orders?.restaurant ?? row.restaurant_id ?? "—",
    restaurantRating: row.restaurant_rating,
    riderRating: row.rider_rating,
    comment: row.comment,
    createdAt: row.created_at,
  }));
}
