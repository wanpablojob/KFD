/**
 * Stalled orders: what "an order stopped moving" means in the admin.
 *
 * The database decides what is stalled (migration 0149, a pg_cron sweep every
 * five minutes). This file only labels what it decided, so the number on the
 * overview and the row in the list cannot drift from the record the rider's
 * performance is built on.
 */

/**
 * How long an order may sit with a rider before the sweep flags it. Must match
 * `v_minutes` in `public.sweep_stalled_orders()` (0149) -- this constant only
 * explains the rule to a reader; it never decides anything.
 */
export const STALL_MINUTES = 45;

/** One open stall, joined to the order it belongs to for display. */
export interface StalledOrder {
  orderId: string;
  reference: string;
  restaurant: string;
  riderName: string | null;
  stage: string;
  /** Whole minutes since the order last moved, at the moment of reading. */
  minutes: number;
}

/**
 * The stall's age right now, not when the sweep last ran.
 *
 * The sweep stores minutes at detection; up to five minutes later that number
 * is stale, and "stalled 45 min" that never grows looks broken. Prefer the
 * order's own clock (`since`) when it is available.
 */
export function stallMinutes(since: string, now: Date): number {
  const from = new Date(since).getTime();
  if (!Number.isFinite(from)) return 0;
  return Math.max(0, Math.floor((now.getTime() - from) / 60_000));
}

/** "1 h 12 min" past an hour, plain minutes below it. */
export function formatStallAge(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * Open stalls as rows ready to render, oldest first.
 *
 * `orders` is the page's already-fetched order list: the stall row carries only
 * ids, and the reference and rider name live on the order. A stall whose order
 * is not in that list is still shown (by its id) rather than dropped -- losing
 * a stuck order because a page did not load it is the failure this feature
 * exists to prevent.
 */
export function stalledRows(
  stalls: {
    orderId: string;
    riderId: string | null;
    stage: string;
    stallSince: string;
  }[],
  orders: { id: string; reference: string; restaurant: string; rider: string }[],
  now: Date,
): StalledOrder[] {
  const byId = new Map(orders.map((o) => [o.id, o]));
  return stalls
    .map((stall) => {
      const order = byId.get(stall.orderId);
      return {
        orderId: stall.orderId,
        reference: order?.reference ?? stall.orderId,
        restaurant: order?.restaurant ?? "—",
        riderName: order?.rider || stall.riderId || null,
        stage: stall.stage,
        minutes: stallMinutes(stall.stallSince, now),
      };
    })
    .sort((a, b) => b.minutes - a.minutes);
}
