/**
 * Where a signed-in person lands when their session starts.
 *
 * The navigator restores the last address (/login, /track, /) when the screens
 * mount after the role resolves. Anything outside the person's own area was
 * then resolved by Stack.Protected's "first available screen" rule, and the
 * public tracker -- the one screen every role may open -- kept winning, so
 * opening the app showed "Track your order" instead of home. This names the
 * home outright. A tapped notification is applied after it, so it still opens
 * its order.
 */
const AREAS: Record<string, { home: string; allowed: string[] }> = {
  customer: {
    home: "/customer",
    allowed: ["/customer", "/rider-apply", "/notifications"],
  },
  rider: { home: "/rider", allowed: ["/rider", "/notifications"] },
  merchant: { home: "/merchant", allowed: ["/merchant", "/notifications"] },
};
const STAFF = { home: "/account", allowed: ["/account", "/notifications"] };

/** The home to send them to, or null when they are already in their own area. */
export function landingFor(role: string, pathname: string): string | null {
  const area = AREAS[role] ?? STAFF;
  const inArea = area.allowed.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  return inArea ? null : area.home;
}
