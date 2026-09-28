import type { Order, Restaurant, RevenuePoint } from "./types";

/**
 * Pure date/metric helpers for the admin dashboard.
 *
 * These live apart from the page component for two reasons: the dashboard is
 * the one screen whose numbers were internally inconsistent (Prompt 2.1/2.2),
 * and a pure module is directly unit-testable without a DOM or a browser.
 */
export const PERIOD_DAYS = 7;

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Percent change from the previous period. Returns 0 when there is no prior
 * data to compare against rather than a misleading infinity.
 */
export function periodDelta(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

function inRange(iso: string, start: number, end: number): boolean {
  const t = new Date(iso).getTime();
  return t >= start && t < end;
}

export interface PeriodDeltas {
  revenue: { current: number; previous: number };
  orders: { current: number; previous: number };
  restaurants: { current: number; previous: number };
}

/**
 * Splits orders (and newly-active restaurants) into the current window and the
 * window immediately before it, so a KPI value and its delta can be made to
 * describe the *same* period (Prompt 2.1).
 *
 * Boundary convention: rolling 7x24h windows ending at `now`, matching
 * `buildRevenueSeries` so the KPI card and the chart cannot disagree about
 * which orders are in scope. Not calendar-midnight days -- rolling windows
 * avoid a timezone-dependent "today" that shifts under the user.
 */
export function splitPeriods(
  orders: Order[],
  restaurants: Restaurant[],
  now: number = Date.now(),
): PeriodDeltas {
  const window = PERIOD_DAYS * DAY_MS;
  const currentStart = now - window;
  const previousStart = now - window * 2;

  const currentOrders = orders.filter((o) => inRange(o.placedAt, currentStart, now));
  const previousOrders = orders.filter((o) =>
    inRange(o.placedAt, previousStart, currentStart),
  );

  return {
    revenue: {
      current: currentOrders.reduce((s, o) => s + o.total, 0),
      previous: previousOrders.reduce((s, o) => s + o.total, 0),
    },
    orders: { current: currentOrders.length, previous: previousOrders.length },
    // "Newly active restaurants in the window" is a flow, so it can carry a
    // period-over-period delta honestly. The standing active count is a stock
    // and is reported separately.
    restaurants: {
      current: restaurants.filter(
        (r) => r.status === "active" && inRange(r.joinedAt, currentStart, now),
      ).length,
      previous: restaurants.filter(
        (r) =>
          r.status === "active" &&
          inRange(r.joinedAt, previousStart, currentStart),
      ).length,
    },
  };
}

/**
 * Seven daily revenue points, oldest first.
 *
 * The old version bucketed every order that ever existed by `toDateString()`,
 * then labelled each bucket with a weekday abbreviation, then sorted by
 * weekday index. That produced two bugs (Prompt 2.2): the chart claimed
 * "last 7 days" while plotting all history, and once the dataset spanned more
 * than a week, several dates collided on the same weekday label -- roughly
 * four "Mon" entries clustered together by the sort.
 *
 * The 7-day sequence is built first, and orders are summed into it. Because 7
 * consecutive days contain each weekday exactly once, the weekday labels are
 * now guaranteed unique, and Map insertion order is already oldest-first so no
 * sort is needed. Days with no orders stay present as 0 so the line has no
 * gaps.
 *
 * Same rolling-window boundary as `splitPeriods`; see the note there.
 */
export function buildRevenueSeries(
  orders: Order[],
  now: number = Date.now(),
): RevenuePoint[] {
  const start = now - PERIOD_DAYS * DAY_MS;
  const formatter = new Intl.DateTimeFormat("en", { weekday: "short" });

  const buckets = new Map<number, RevenuePoint>();
  for (let i = 0; i < PERIOD_DAYS; i++) {
    const at = start + i * DAY_MS;
    buckets.set(at, { label: formatter.format(new Date(at)), orders: 0, revenue: 0 });
  }

  for (const o of orders) {
    const t = new Date(o.placedAt).getTime();
    if (t < start || t >= now) continue;
    const key = start + Math.floor((t - start) / DAY_MS) * DAY_MS;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.orders += 1;
    bucket.revenue += o.total;
  }

  return Array.from(buckets.values());
}
