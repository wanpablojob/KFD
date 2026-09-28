export type AppRole = "admin" | "merchant" | null;

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
 */
export function roleTargetPath(
  role: AppRole,
  restaurantId: string | null,
  target: string | null,
): string | null {
  if (role === "admin") {
    return target && !isMerchantArea(target) ? target : "/";
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