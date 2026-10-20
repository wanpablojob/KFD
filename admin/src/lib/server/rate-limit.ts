/**
 * In-memory sliding-window rate limiter for the notification routes.
 *
 * Deliberately dependency-free and per-process. On a serverless host the
 * instances are not shared, so this bounds abuse reaching one warm instance
 * rather than enforcing a global quota. That is still worth having: every
 * route that uses it has a side effect that is expensive or externally
 * visible (email through Resend, Expo push through the platform account), and
 * the alternative today is no bound at all. A shared store is the upgrade path
 * if a global quota is ever needed; the call sites do not have to change.
 *
 * The key is always the verified caller id plus the route, never a body field,
 * so one account cannot exhaust another account's budget.
 */

const buckets = new Map<string, number[]>();

/** Bound memory even if callers keep inventing new keys. */
const MAX_TRACKED_KEYS = 5000;

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the oldest hit leaves the window; 0 when allowed. */
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((at) => at > cutoff);

  if (hits.length >= limit) {
    buckets.set(key, hits);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)),
    };
  }

  hits.push(now);
  buckets.set(key, hits);

  if (buckets.size > MAX_TRACKED_KEYS) {
    for (const [tracked, times] of buckets) {
      if (times.every((at) => at <= cutoff)) buckets.delete(tracked);
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test hook: drop one key, or every key when called without one. */
export function resetRateLimit(key?: string): void {
  if (key === undefined) buckets.clear();
  else buckets.delete(key);
}
