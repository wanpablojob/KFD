import type { Order } from "./types";

/**
 * How many riders today needs, hour by hour (panel feedback).
 *
 * 1. Orders per hour today are forecast from the same weekday in the last four
 *    weeks, the most recent weighted most (4, 3, 2, 1): Mondays look like
 *    Mondays. With fewer than two such weekdays of history, the average day of
 *    the last 14 days is used instead, and the result says which.
 * 2. Riders follow from Little's Law: deliveries in progress at once = orders
 *    per hour x hours per delivery. A rider carries up to two jobs (0148), so
 *    riders needed = that / 2, rounded up, and at least one in any hour that
 *    expects an order. Hours per delivery is the median order-to-door time of
 *    the last 30 days, or 40 minutes until there is any.
 *
 * Cancelled orders never needed a rider and are left out. Hours are local.
 */

export const JOBS_PER_RIDER = 2;
const WEEK_WEIGHTS = [4, 3, 2, 1];
const DEFAULT_DELIVERY_MINUTES = 40;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface HourForecast {
  hour: number;
  /** Expected orders in this hour, one decimal. */
  forecast: number;
  /** Orders actually placed in this hour today so far. */
  actual: number;
  ridersNeeded: number;
}

export interface RiderForecast {
  hours: HourForecast[];
  expectedOrders: number;
  peakRiders: number;
  /** The hour of the peak, or null on a day expecting no orders. */
  peakHour: number | null;
  deliveryMinutes: number;
  basis: "same-weekday" | "recent-days" | "none";
  /** How many past days the forecast rests on. */
  samples: number;
}

function startOfDay(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** The same calendar day `days` earlier, at local midnight. */
function daysBefore(dayStart: number, days: number): number {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - days).getTime();
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function forecastRiders(
  orders: readonly Order[],
  now: Date,
): RiderForecast {
  const today = startOfDay(now.getTime());
  const counted = orders.filter((o) => o.status !== "cancelled");

  // Orders per local day and hour.
  const perDay = new Map<number, number[]>();
  let firstDay = Infinity;
  for (const o of counted) {
    const t = new Date(o.placedAt).getTime();
    if (!Number.isFinite(t)) continue;
    const day = startOfDay(t);
    firstDay = Math.min(firstDay, day);
    const hours = perDay.get(day) ?? new Array<number>(24).fill(0);
    hours[new Date(t).getHours()] += 1;
    perDay.set(day, hours);
  }
  const hoursOf = (day: number) =>
    perDay.get(day) ?? new Array<number>(24).fill(0);
  // A past day counts as history only once the platform was taking orders.
  const isHistory = (day: number) => day >= firstDay && day < today;

  let basis: RiderForecast["basis"] = "none";
  let samples = 0;
  let forecast = new Array<number>(24).fill(0);

  const weeks = WEEK_WEIGHTS.map((weight, i) => ({
    weight,
    day: daysBefore(today, 7 * (i + 1)),
  })).filter((w) => isHistory(w.day));
  if (weeks.length >= 2) {
    const total = weeks.reduce((sum, w) => sum + w.weight, 0);
    forecast = forecast.map(
      (_, h) =>
        weeks.reduce((sum, w) => sum + w.weight * hoursOf(w.day)[h], 0) / total,
    );
    basis = "same-weekday";
    samples = weeks.length;
  } else {
    const days = Array.from({ length: 14 }, (_, i) =>
      daysBefore(today, i + 1),
    ).filter(isHistory);
    if (days.length > 0) {
      forecast = forecast.map(
        (_, h) => days.reduce((sum, d) => sum + hoursOf(d)[h], 0) / days.length,
      );
      basis = "recent-days";
      samples = days.length;
    }
  }

  const since = today - 30 * DAY_MS;
  const durations = counted
    .filter((o) => o.status === "delivered" && o.deliveredAt)
    .map((o) => ({
      placed: new Date(o.placedAt).getTime(),
      done: new Date(o.deliveredAt as string).getTime(),
    }))
    .filter((d) => d.placed >= since && d.done > d.placed)
    .map((d) => (d.done - d.placed) / 60000);
  const measured = median(durations);
  // Clamped: one stray order left "out for delivery" overnight must not make
  // every hour look like it needs ten riders.
  const deliveryMinutes = Math.round(
    Math.min(Math.max(measured ?? DEFAULT_DELIVERY_MINUTES, 10), 180),
  );

  const actual = hoursOf(today);
  const hours: HourForecast[] = forecast.map((f, hour) => {
    const inProgress = f * (deliveryMinutes / 60);
    return {
      hour,
      forecast: Math.round(f * 10) / 10,
      actual: actual[hour],
      ridersNeeded:
        f > 0 ? Math.max(1, Math.ceil(inProgress / JOBS_PER_RIDER)) : 0,
    };
  });

  const peakRiders = Math.max(0, ...hours.map((h) => h.ridersNeeded));
  const peak =
    peakRiders > 0
      ? (hours.find((h) => h.ridersNeeded === peakRiders) ?? null)
      : null;

  return {
    hours,
    expectedOrders: Math.round(forecast.reduce((sum, f) => sum + f, 0)),
    peakRiders,
    peakHour: peak ? peak.hour : null,
    deliveryMinutes,
    basis,
    samples,
  };
}
