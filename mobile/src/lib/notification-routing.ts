/**
 * Where a tapped notification should take the user.
 *
 * Kept out of _layout.tsx because the decision has three inputs -- the payload,
 * the signed-in role, and whether the session has finished resolving -- and only
 * the middle two are easy to reason about when they are buried in an effect.
 * The cold-start race is the reason this exists at all: getLastNotificationResponse()
 * resolves before the auth session does, so routing on it immediately would push
 * to a route the Stack.Protected guard has not mounted yet, and the navigation is
 * silently dropped.
 */

/** The session roles this app knows about. `null` is "signed out". */
export type SessionRole = "rider" | "customer" | "merchant" | "admin" | null;

export type NotificationRoute =
  /** A dispatch offer: open the rider's Available tab. */
  | { kind: "rider-offers" }
  /** The rider finished a delivery on another device: open Deliveries. */
  | { kind: "rider-home" }
  /** A new or updated order at the merchant's restaurant: open their Orders tab. */
  | { kind: "merchant-orders" }
  /** Public order tracking, by reference. Works signed out. */
  | { kind: "track"; reference: string };

/**
 * True once the role is known and will not change again: no session loading, and
 * either no user (nothing more to resolve) or a resolved role -- including the
 * roleError case, which is also terminal. Routing before this point is a race.
 */
export function isRoleSettled(input: {
  sessionLoading: boolean;
  user: unknown;
  role: SessionRole;
  roleError: boolean;
}): boolean {
  if (input.sessionLoading) return false;
  if (input.roleError) return true;
  return !input.user || input.role !== null;
}

function readPayload(data: unknown): { type: string | null; reference: string | null } {
  if (typeof data !== "object" || data === null) {
    return { type: null, reference: null };
  }
  const record = data as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : null;
  const reference =
    typeof record.reference === "string" && record.reference.trim()
      ? record.reference.trim()
      : null;
  return { type, reference };
}

/**
 * The routing decision. Returns null for "do nothing", which is the correct
 * answer for a rider-only payload arriving for a signed-in customer and for a
 * payload with nothing usable in it.
 */
export function routeForNotification(
  data: unknown,
  role: SessionRole
): NotificationRoute | null {
  const { type, reference } = readPayload(data);

  // Rider-scoped payloads are checked against the role rather than left to the
  // Stack.Protected guard. The guard already rejects them, but it rejects by
  // redirecting somewhere else, so a merchant tapping an offer alert would be
  // bounced rather than left where they were.
  if (type === "dispatch_offer") {
    return role === "rider" ? { kind: "rider-offers" } : null;
  }
  if (type === "delivery_completed") {
    return role === "rider" ? { kind: "rider-home" } : null;
  }

  // Merchant alerts carry only the order reference. For a merchant that means
  // "an order needs you", so it opens their Orders tab, not the tracker.
  if (reference && role === "merchant") {
    return { kind: "merchant-orders" };
  }

  // Other reference-only payloads (order status for customers) go to the
  // public tracker, which is deliberately reachable signed out.
  if (reference) {
    return { kind: "track", reference };
  }

  return null;
}

/** The router path for a decision. Separate so the tests can assert on it. */
export function pathForRoute(route: NotificationRoute): string {
  switch (route.kind) {
    case "rider-offers":
      return "/rider/offers";
    case "rider-home":
      return "/rider";
    case "merchant-orders":
      return "/merchant";
    case "track":
      return `/track?ref=${encodeURIComponent(route.reference)}`;
  }
}
