/**
 * Daily sales for the merchant Sales page.
 *
 * Only delivered orders count: a pending, rejected or failed order earned the
 * kitchen nothing. The figure is the food subtotal, not the order total, because
 * the delivery and service fees are not the restaurant's money. Commission is
 * not deducted here; the rate is not agreed yet.
 *
 * Days are local calendar days (the browser's, which is Manila for every
 * merchant), keyed without toISOString so a late-evening order is not filed
 * under the next UTC day. See merchant-order-range.ts for that bug.
 */

export interface SalesOrder {
  placedAt: string;
  status: string;
  subtotal: number;
}

export interface SalesDay {
  /** Local date, YYYY-MM-DD. */
  date: string;
  orders: number;
  sales: number;
}

function dayKey(day: Date): string {
  const m = String(day.getMonth() + 1).padStart(2, "0");
  const d = String(day.getDate()).padStart(2, "0");
  return `${day.getFullYear()}-${m}-${d}`;
}

/** One row per day for the last `days` days ending today, newest first, zero days included. */
export function salesByDay(orders: SalesOrder[], days: number, now: Date): SalesDay[] {
  const rows: SalesDay[] = [];
  const index = new Map<string, SalesDay>();
  for (let i = 0; i < days; i += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const row = { date: dayKey(day), orders: 0, sales: 0 };
    rows.push(row);
    index.set(row.date, row);
  }

  for (const order of orders) {
    if (order.status !== "delivered") continue;
    const row = index.get(dayKey(new Date(order.placedAt)));
    if (!row) continue;
    row.orders += 1;
    // Rounded per step so a long run of centavo amounts cannot drift.
    row.sales = Math.round((row.sales + order.subtotal) * 100) / 100;
  }
  return rows;
}

/** Totals over the first `days` rows of salesByDay's output. */
export function totalOf(rows: SalesDay[], days: number): { orders: number; sales: number } {
  return rows.slice(0, days).reduce(
    (sum, row) => ({
      orders: sum.orders + row.orders,
      sales: Math.round((sum.sales + row.sales) * 100) / 100,
    }),
    { orders: 0, sales: 0 },
  );
}
