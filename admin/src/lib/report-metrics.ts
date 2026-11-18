import type { Order, OrderStatus } from "./types";

/**
 * Money and volume over an explicit date range, for the Reports page.
 *
 * The dashboard answers "this week" with rolling 7-day windows. That is the
 * right shape for a shift, and the wrong shape for "what did we make last
 * month": there is no range to ask for, no month to total, and nothing to hand
 * an accountant. This module is the arithmetic; the page is the controls.
 *
 * Three rules are taken from the code that already owns them, so the reports
 * page cannot disagree with the dashboard or the rider's cash:
 *
 *  * Only delivered orders are revenue (`countsAsRevenue`, dashboard-metrics).
 *    A cancelled or in-flight order has not earned anything yet.
 *  * Net revenue is the order total less refunds (`netRevenue`, dashboard-metrics).
 *    Refunds are recorded after delivery (0084) and deducted from the order they
 *    belong to.
 *
 * Those two rules are restated inline rather than imported, because this module
 * is loaded directly by the node test runner, which (unlike the Next bundler)
 * will not resolve an extensionless import. A test pins the restatement to the
 * dashboard's definitions so the two cannot drift apart silently.
 *  * The rider pays the shop the food subtotal at pickup (0147), so a shop is
 *    never owed anything by Meriendash. What Meriendash takes in is the rest of the bill:
 *    the delivery and service fees.
 *
 * Days are local calendar days, keyed without `toISOString` (the merchant-sales
 * bug): Manila is UTC+8, so a 9pm order belongs to the day the operator read on
 * the receipt, not to the next UTC day.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Rounded to centavos, so a long run of amounts cannot drift. */
export function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Same rule as `countsAsRevenue` in dashboard-metrics. Restated, not imported
 * (see the note at the top); a test asserts the two agree.
 */
function countsAsRevenue(order: Order): boolean {
  return order.status === "delivered";
}

/**
 * Same rule as `netRevenue` in dashboard-metrics: the order total less what
 * went back. The refund RPC caps the total at the order total, so this cannot
 * go negative for real data; the clamp is in `buildReport`.
 */
function netRevenue(order: Order): number {
  return order.total - (order.refunded ?? 0);
}

/** Local calendar day key, YYYY-MM-DD. Never `toISOString()`: that is UTC. */
export function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD date input value into local midnight.
 *
 * Returns null for a malformed value and for a real-looking date that does not
 * exist (2026-02-31), which `new Date` would silently roll into March.
 */
export function parseLocalDay(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/** Every local day from `from` to `to`, inclusive. Empty for an invalid or reversed range. */
export function enumerateDays(from: string, to: string): string[] {
  const start = parseLocalDay(from);
  const end = parseLocalDay(to);
  if (!start || !end || start > end) return [];
  const days: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(localDayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** The last `days` local days ending today, as date-input values. */
export function presetRange(
  days: number,
  now: Date,
): { from: string; to: string } {
  const span = Math.max(1, Math.floor(days));
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - (span - 1));
  return { from: localDayKey(start), to: localDayKey(end) };
}

/**
 * Move a local day key by `delta` days, e.g. to widen a query window.
 *
 * The Supabase query bounds a timestamptz with a date string, and Postgres
 * reads that string in UTC. Manila is UTC+8, so `placed_at >= '2026-09-28'`
 * starts at 8am local and silently drops everything from a third of the day.
 * Pages that care about local days fetch one day either side and decide
 * membership themselves; this is the "one day either side".
 *
 * An unparseable key is returned unchanged: the caller's own range validation
 * is the thing that should reject it, not a date helper.
 */
export function shiftDays(key: string, delta: number): string {
  const date = parseLocalDay(key);
  if (!date) return key;
  date.setDate(date.getDate() + delta);
  return localDayKey(date);
}

/** "Oct 19" for a table or chart label, built without an Intl locale. */
export function dayLabel(key: string): string {
  const date = parseLocalDay(key);
  return date ? `${MONTHS[date.getMonth()]} ${date.getDate()}` : key;
}

export interface ReportTotals {
  /** Delivered orders only. */
  orders: number;
  cancelled: number;
  /** Order totals of delivered orders, before refunds. */
  gross: number;
  /** Every cent returned to customers on those orders. */
  refunds: number;
  /** gross - refunds. */
  netRevenue: number;
  /** Food subtotals, paid to shops by riders at pickup (0147). */
  paidToShops: number;
  deliveryFees: number;
  /** Delivery and service fees: the part of the bill that is Meriendash's. */
  kfdFees: number;
  averageOrderValue: number;
}

export interface ReportDay {
  /** Local date, YYYY-MM-DD. */
  date: string;
  label: string;
  orders: number;
  netRevenue: number;
  refunds: number;
}

export interface ReportShop {
  restaurant: string;
  orders: number;
  gross: number;
  refunds: number;
  /** Food subtotals the riders paid this shop at pickup. */
  paidAtPickup: number;
}

export interface ReportStatus {
  status: OrderStatus;
  count: number;
}

export interface Report {
  totals: ReportTotals;
  /** One entry per local day in the range, zero days included, oldest first. */
  days: ReportDay[];
  /** Busiest earner first. */
  shops: ReportShop[];
  statuses: ReportStatus[];
}

const STATUS_ORDER: readonly OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

/**
 * Total a set of orders over a local date range.
 *
 * Orders outside the range are ignored even if the caller passed a superset:
 * the SQL range filter bounds `placed_at` in UTC and can bleed a few hours into
 * the next local day, and a report that silently included them would be wrong
 * in a way nobody notices until the month does not reconcile.
 */
export function buildReport(
  orders: readonly Order[],
  from: string,
  to: string,
): Report {
  const days = enumerateDays(from, to);
  const dayIndex = new Map<string, ReportDay>();
  for (const key of days) {
    dayIndex.set(key, {
      date: key,
      label: dayLabel(key),
      orders: 0,
      netRevenue: 0,
      refunds: 0,
    });
  }

  const shops = new Map<string, ReportShop>();
  const statusCounts = new Map<OrderStatus, number>();

  let delivered = 0;
  let gross = 0;
  let refunds = 0;
  let food = 0;
  let deliveryFees = 0;

  for (const order of orders) {
    const key = localDayKey(new Date(order.placedAt));
    const day = dayIndex.get(key);
    if (!day) continue;

    statusCounts.set(order.status, (statusCounts.get(order.status) ?? 0) + 1);
    if (!countsAsRevenue(order)) continue;

    // The refund RPC caps the total at the order total; a negative or missing
    // value is not money that went back, so it is clamped rather than trusted.
    const refunded = Math.max(0, order.refunded ?? 0);

    delivered += 1;
    gross += order.total;
    refunds += refunded;
    food += order.subtotal;
    deliveryFees += order.deliveryFee;

    day.orders += 1;
    day.netRevenue += netRevenue(order);
    day.refunds += refunded;

    let shop = shops.get(order.restaurant);
    if (!shop) {
      shop = {
        restaurant: order.restaurant,
        orders: 0,
        gross: 0,
        refunds: 0,
        paidAtPickup: 0,
      };
      shops.set(order.restaurant, shop);
    }
    shop.orders += 1;
    shop.gross += order.total;
    shop.refunds += refunded;
    shop.paidAtPickup += order.subtotal;
  }

  const shopRows: ReportShop[] = [...shops.values()].map((shop) => ({
    restaurant: shop.restaurant,
    orders: shop.orders,
    gross: cents(shop.gross),
    refunds: cents(shop.refunds),
    paidAtPickup: cents(shop.paidAtPickup),
  }));
  shopRows.sort((a, b) => b.gross - a.gross);

  // Named `netTotal`, not `netRevenue`: a local with the imported function's
  // name shadows it for the whole scope, and the call above then hits the
  // temporal dead zone instead of the function.
  const netTotal = cents(gross - refunds);

  return {
    totals: {
      orders: delivered,
      cancelled: statusCounts.get("cancelled") ?? 0,
      gross: cents(gross),
      refunds: cents(refunds),
      netRevenue: netTotal,
      paidToShops: cents(food),
      deliveryFees: cents(deliveryFees),
      kfdFees: cents(gross - food),
      averageOrderValue: delivered === 0 ? 0 : cents(netTotal / delivered),
    },
    days: days.map((key) => {
      const day = dayIndex.get(key)!;
      return {
        ...day,
        netRevenue: cents(day.netRevenue),
        refunds: cents(day.refunds),
      };
    }),
    shops: shopRows,
    statuses: STATUS_ORDER.filter(
      (status) => (statusCounts.get(status) ?? 0) > 0,
    ).map((status) => ({ status, count: statusCounts.get(status) ?? 0 })),
  };
}
