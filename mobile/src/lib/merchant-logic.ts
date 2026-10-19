/**
 * Rules for the merchant surface, kept pure so they are tested without a
 * device. They mirror the web portal and the database:
 *
 * - transitions match orders_guard_client_status (0083): a merchant accepts,
 *   starts preparing, or cancels; the rider leg is not theirs to move;
 * - sales are the delivered food subtotal net of refunds, a refund capped at
 *   the food value, exactly as admin/src/lib/merchant-sales.ts computes them.
 */

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["cancelled"],
  out_for_delivery: [],
  delivered: [],
  cancelled: [],
};

export function merchantNextStatuses(status: OrderStatus): OrderStatus[] {
  return TRANSITIONS[status] ?? [];
}

/** A pending order older than this is shown as overdue. */
export const OVERDUE_MINUTES = 5;

export function minutesWaiting(placedAt: string, now: Date): number {
  return Math.max(
    0,
    Math.floor((now.getTime() - new Date(placedAt).getTime()) / 60000)
  );
}

/** "2× Chicken Inasal, 1× Rice" -- what the kitchen has to make. */
export function itemSummary(items: { name: string; quantity: number }[]): string {
  return items.map((i) => `${i.quantity}× ${i.name}`).join(", ");
}

export interface SalesOrder {
  id: string;
  placedAt: string;
  status: string;
  subtotal: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Food sales and delivered-order counts for today, the last 7 days and the
 * last 30 days. Days are local calendar days, today included.
 */
export function salesTotals(
  orders: SalesOrder[],
  refundedByOrder: Map<string, number>,
  now: Date
) {
  const dayStart = (daysAgo: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo).getTime();
  const windows = { today: dayStart(0), week: dayStart(6), month: dayStart(29) };
  const totals = {
    today: { orders: 0, sales: 0 },
    week: { orders: 0, sales: 0 },
    month: { orders: 0, sales: 0 },
  };
  for (const o of orders) {
    if (o.status !== "delivered") continue;
    const at = new Date(o.placedAt).getTime();
    const refund = Math.min(Math.max(refundedByOrder.get(o.id) ?? 0, 0), o.subtotal);
    const net = o.subtotal - refund;
    for (const key of ["today", "week", "month"] as const) {
      if (at >= windows[key]) {
        totals[key].orders += 1;
        totals[key].sales = round(totals[key].sales + net);
      }
    }
  }
  return totals;
}

export function todayCounts(orders: { placedAt: string; status: string }[], now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return {
    pending: orders.filter((o) => o.status === "pending").length,
    today: orders.filter(
      (o) => new Date(o.placedAt).getTime() >= start && o.status !== "cancelled"
    ).length,
  };
}

/** Price as typed: a non-negative number of pesos, rounded to centavos, or null. */
export function parsePrice(text: string): number | null {
  const value = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(value) && value >= 0
    ? Math.round(value * 100) / 100
    : null;
}

export type SalesWindow = "today" | "week" | "month";

/** Every order placed in the window (any status), newest first: what "Today" opens. */
export function ordersInWindow<T extends { placedAt: string }>(
  orders: T[],
  window: SalesWindow,
  now: Date
): T[] {
  const back = window === "today" ? 0 : window === "week" ? 6 : 29;
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - back
  ).getTime();
  return orders
    .filter((o) => new Date(o.placedAt).getTime() >= start)
    .sort((a, b) => b.placedAt.localeCompare(a.placedAt));
}

/** All-time delivered food sales, net of refunds capped at the food value. */
export function allTimeTotals(
  delivered: { id: string; subtotal: number }[],
  refundedByOrder: Map<string, number>
) {
  let sales = 0;
  for (const o of delivered) {
    const refund = Math.min(Math.max(refundedByOrder.get(o.id) ?? 0, 0), o.subtotal);
    sales = round(sales + o.subtotal - refund);
  }
  return { orders: delivered.length, sales };
}
