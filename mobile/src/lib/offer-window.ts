/**
 * The offer expiry window, read from the offers themselves rather than restated
 * as copy.
 *
 * The Available tab used to say "Offers expire in 5 minutes" as literal text
 * while the countdown on each card came from `expires_at`. Those were two
 * sources of truth for one number: whoever tuned the server-side window in
 * migration 0045 would change the real behaviour and leave this sentence
 * quietly lying, and the rider would be told one thing and shown another.
 *
 * So the window is derived from `expires_at - offered_at` on the offers we were
 * actually given. If the server's window changes, this copy follows it with no
 * second edit, and it cannot drift from the countdown it sits above.
 */
export function offerWindowLabel(
  offers: readonly { offeredAt: string; expiresAt: string }[]
): string | null {
  const windows = offers
    .map((o) => new Date(o.expiresAt).getTime() - new Date(o.offeredAt).getTime())
    .filter((ms) => Number.isFinite(ms) && ms > 0);

  // One window is expected. A mixed set means the server changed the window
  // mid-flight, so no single sentence is true; say nothing rather than pick.
  if (windows.length === 0) return null;
  if (windows.some((ms) => ms !== windows[0])) return null;

  const minutes = Math.round(windows[0] / 60000);
  if (minutes < 1) return null;
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}
