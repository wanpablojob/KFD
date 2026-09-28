/**
 * The unread rule, with no Supabase import, so it can be tested directly.
 *
 * Split out of notifications.ts purely for that reason: that module creates a
 * browser client at import time, which a plain node --test run cannot resolve.
 */

/**
 * Whether an order placed at `placedAt` is unread for an operator whose
 * high-water mark is `lastSeenAt`.
 *
 * A null cursor means the operator has never acknowledged anything, so
 * everything is unread. That is the honest reading -- it is also the state the
 * old component-local `seen` boolean started in, and the reason a fresh
 * sign-in shows a dot rather than nothing.
 *
 * An unparseable `placedAt` reads as *read*. The badge is a claim that there is
 * news; when the data cannot support the claim, the safe failure is a missing
 * badge, not one that sends an operator hunting for an order that is not there.
 */
export function isUnreadSince(
  placedAt: string,
  lastSeenAt: string | null
): boolean {
  if (!lastSeenAt) return true;

  const placed = new Date(placedAt).getTime();
  const seen = new Date(lastSeenAt).getTime();

  if (Number.isNaN(placed) || Number.isNaN(seen)) return false;
  return placed > seen;
}
