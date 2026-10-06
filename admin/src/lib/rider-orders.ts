/**
 * Reading one rider's delivery history by id.
 *
 * The pure half of that read lives here so it can be tested: the scope it is
 * allowed to use, and how a row is mapped. The fetch itself is in
 * supabase/queries.ts, which keeps the real Supabase client's generated types.
 *
 * Why this exists rather than filtering by name: the riders page originally
 * looked orders up by `orders.rider`, which holds the rider's *name* as text.
 * Two riders with the same name therefore shared a delivery history, and the
 * 0025 comment says outright that the text column exists for receipts while
 * `rider_id` is "for RLS and integrity". This is that column.
 *
 * Why a scope function rather than a filter argument: the original fetcher ran
 * with an empty name and could not be corrected, because useAsyncData captures
 * its fetcher once on mount. Returning null for a missing id means the caller
 * has nothing to query and no way to accidentally query everything.
 */

import type { Order, OrderItem } from "@/lib/types";

export interface RiderOrderScope {
  /** Always `rider_id`. Not configurable, and not the name. */
  column: "rider_id";
  value: string;
}

/** null when there is no resolved id, which means: do not query. */
export function riderOrderScope(
  riderId: string | null | undefined,
): RiderOrderScope | null {
  const trimmed = (riderId ?? "").trim();
  if (!trimmed) return null;
  return { column: "rider_id", value: trimmed };
}

/** The columns this read needs, and only those. */
export const RIDER_ORDER_COLUMNS =
  "id, reference, customer, customer_phone, restaurant, restaurant_id, items, subtotal, delivery_fee, total, status, payment, placed_at, rider, rider_id, rider_payout, delivery_address, delivery_failed_reason, delivery_failed_at, delivery_failed_by, rejection_reason" as const;

/**
 * One of this rider's orders.
 *
 * Extends Order with the three columns the riders surface needs and Order does
 * not carry: which rider row owns the order, the fee frozen onto it, and who
 * reported the delivery as failed.
 */
export interface RiderDelivery extends Order {
  riderId: string | null;
  /**
   * Frozen at claim time. Null until an order is claimed, and a real zero is a
   * waived fee -- the two are not the same and must not be collapsed.
   */
  riderPayout: number | null;
  /** riders.id of whoever reported the failure. Kept after reassignment. */
  deliveryFailedBy: string | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapItems(value: unknown): OrderItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((line) => {
    const record = (typeof line === "object" && line !== null ? line : {}) as Record<
      string,
      unknown
    >;
    return {
      name: String(record.name ?? ""),
      quantity: num(record.quantity),
      price: num(record.price),
    };
  });
}

/**
 * Maps a page of rows.
 *
 * Nullable columns are mapped rather than cast over: gen-types hands back a
 * RETURNS TABLE as all-non-null, and `rider_payout` in particular is null
 * until an order is claimed. Mapping here rather than at the call site means
 * there is one place where "absent" becomes null instead of `undefined`.
 */
export function mapRiderOrderRows(
  rows: readonly Record<string, unknown>[] | null | undefined,
): RiderDelivery[] {
  return (rows ?? []).map((row) => ({
    id: String(row.id ?? ""),
    reference: String(row.reference ?? ""),
    customer: String(row.customer ?? ""),
    customerPhone: text(row.customer_phone),
    restaurant: String(row.restaurant ?? ""),
    items: mapItems(row.items),
    subtotal: num(row.subtotal),
    deliveryFee: num(row.delivery_fee),
    total: num(row.total),
    status: String(row.status ?? "") as Order["status"],
    payment: String(row.payment ?? "") as Order["payment"],
    placedAt: String(row.placed_at ?? ""),
    rider: String(row.rider ?? ""),
    rejectionReason: text(row.rejection_reason),
    deliveryFailedReason: text(row.delivery_failed_reason),
    deliveryFailedAt: text(row.delivery_failed_at),
    riderId: text(row.rider_id),
    riderPayout:
      row.rider_payout === null || row.rider_payout === undefined
        ? null
        : num(row.rider_payout),
    deliveryFailedBy: text(row.delivery_failed_by),
  }));
}

export interface RiderDeliveryPage {
  rows: RiderDelivery[];
  /** 1-based page that was requested. */
  page: number;
  /** Total matching orders, when the server counted them. */
  total: number | null;
  hasMore: boolean;
}