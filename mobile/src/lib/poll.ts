/**
 * Polling that does not stampede.
 *
 * Two things go wrong when many clients poll the same endpoint:
 *
 * 1. They synchronise. Everyone who opened the app in the same minute fires
 *    together, so the database sees the burst, not the average. `pollEvery`
 *    spreads each client's interval by ±20%, which turns the same total request
 *    rate into a smooth stream.
 *
 * 2. They keep hammering a failing endpoint. A fixed interval means every
 *    client retries at the same cadence during an outage, which is the moment
 *    the database can least afford it. `backoffFor` doubles the interval per
 *    consecutive failure, up to a cap, so a degraded backend is given room.
 *
 * Both are pure and take an injectable `random`, so the tests are deterministic
 * and the behaviour is not hidden inside a hook.
 */

/** How far either side of the base interval a client's poll may land. */
export const POLL_JITTER = 0.2;

/** The slowest a failing poll will back off to. */
export const MAX_POLL_MS = 5 * 60_000;

/**
 * The base interval, jittered by ±POLL_JITTER.
 *
 * Never returns a non-positive number for a positive base: a zero interval
 * would poll as fast as the network allows, which is the opposite of the point.
 */
export function pollEvery(baseMs: number, random: () => number = Math.random): number {
  const spread = baseMs * POLL_JITTER;
  const jittered = baseMs - spread + random() * spread * 2;
  return Math.max(1, Math.round(jittered));
}

/**
 * The interval to use after `failureCount` consecutive failures.
 *
 * Zero failures is the normal jittered cadence. Each failure doubles it, capped
 * at MAX_POLL_MS *and* jittered, so clients that failed together do not retry
 * together either.
 */
export function backoffFor(
  baseMs: number,
  failureCount: number,
  random: () => number = Math.random
): number {
  if (!Number.isFinite(failureCount) || failureCount <= 0) {
    return pollEvery(baseMs, random);
  }
  // Cap the exponent before multiplying: 2**n overflows to Infinity long
  // before n reaches the cap, and Infinity * baseMs is not min()-able.
  const factor = 2 ** Math.min(Math.floor(failureCount), 5);
  const backedOff = Math.min(baseMs * factor, MAX_POLL_MS);
  return Math.min(pollEvery(backedOff, random), MAX_POLL_MS);
}
