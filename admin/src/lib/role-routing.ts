/**
 * Every role the database can hold (app_role).
 *
 * This used to be `"admin" | "merchant" | null`, which was true when only
 * operators had an `app_users` row. Customers and riders have rows now, so
 * that type was a lie: `fetchUserRole` cast the database value into it and a
 * customer became a role the console believed in. Both are listed here so the
 * type cannot lie again, and `roleTargetPath` is what decides that neither has
 * a console.
 */
export type AppRole = "admin" | "merchant" | "customer" | "rider" | null;

/** The roles that have a web console. Customers and riders use the app. */
export function isOperatorRole(role: AppRole): role is "admin" | "merchant" {
  return role === "admin" || role === "merchant";
}

/**
 * The roles this database can hold, mirroring the `app_role` enum.
 *
 * Anything outside this list reads as null: an unknown role must fail closed
 * to "no console", never default into one. Before this existed the database
 * value was cast straight into a two-member union, so a `customer` arrived as
 * a role the console believed in and every customer was routed to the
 * merchant portal.
 */
const KNOWN_ROLES = ["admin", "merchant", "customer", "rider"] as const;

export function asAppRole(value: unknown): AppRole {
  return typeof value === "string" && (KNOWN_ROLES as readonly string[]).includes(value)
    ? (value as (typeof KNOWN_ROLES)[number])
    : null;
}

/**
 * The post-login landing decision, kept pure so it can be tested without a
 * Supabase client.
 *
 * The `target` the login page was reached with (from ?next=) is only honored
 * when it sits inside the signed-in role's own area. Before this rule, an
 * admin who signed in at /login?next=/merchant -- reached after the merchant
 * gate bounced a signed-out visitor -- was sent straight to the merchant
 * console. Admins are allowed in the merchant area, so nothing stopped it; it
 * just silently landed the wrong dashboard.
 *
 * "/" is the public landing page and is NOT an admin destination. An admin
 * with no usable target lands on /dashboard instead; a target of "/" is
 * treated as "no target" so a bookmarked /login?next=/ cannot dump a signed-in
 * admin back onto the marketing page.
 */
export function roleTargetPath(
  role: AppRole,
  restaurantId: string | null,
  target: string | null,
): string | null {
  if (role === "admin") {
    const usable = target && target !== "/" ? target : null;
    return usable && !isMerchantArea(usable) ? usable : "/dashboard";
  }
  if (role === "merchant" && restaurantId) {
    return target && isMerchantArea(target) ? target : "/merchant";
  }
  return null;
}

/**
 * Lands inside the merchant portal, or browsed there. Deliberately exact:
 * "/merchant" and "/merchant/…" count, but "/merchants" (the admin-only
 * merchant-access page) does not share the boundary.
 */
function isMerchantArea(path: string): boolean {
  return path === "/merchant" || path.startsWith("/merchant/");
}