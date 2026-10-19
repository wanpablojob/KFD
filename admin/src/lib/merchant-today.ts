/**
 * Figures for the merchant "Today" screen.
 *
 * Sales are the food subtotal, the same definition the Sales page uses: the
 * delivery and service fees on an order are not the restaurant's money, so
 * counting the order total here would show a kitchen more than it earned and
 * disagree with its own Sales page for the same day.
 */

export interface TodayOrder {
  placedAt: string;
  status: string;
  subtotal: number;
}

/** A pending order older than this is shown as overdue. */
export const OVERDUE_MINUTES = 5;

export function todayStats(orders: TodayOrder[], now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todays = orders.filter(
    (o) => new Date(o.placedAt).getTime() >= start && o.status !== "cancelled",
  );
  return {
    orders: todays.length,
    sales: Math.round(todays.reduce((sum, o) => sum + o.subtotal, 0) * 100) / 100,
    pending: orders.filter((o) => o.status === "pending").length,
  };
}

/** Whole minutes since the order was placed, never negative. */
export function minutesWaiting(placedAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(placedAt).getTime()) / 60000));
}

/** "2× Chicken Inasal, 1× Rice" -- what the kitchen has to make. */
export function itemSummary(items: { name: string; quantity: number }[]): string {
  return items.map((i) => `${i.quantity}× ${i.name}`).join(", ");
}
