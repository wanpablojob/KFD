import { supabase } from "./supabase/client";
import { roleTargetPath, type AppRole } from "./role-routing";

export type { AppRole } from "./role-routing";

export interface UserRole {
  role: AppRole;
  restaurantId: string | null;
  restaurantName: string | null;
}

/**
 * Resolves the signed-in user's role from app_users.
 *
 * Returns role: null when there is no session, or when the account has no
 * app_users row. There is deliberately no default role: a missing row must
 * read as "not provisioned", never as a fallback, because defaulting upward
 * would hand the whole platform to anyone who can create an auth user.
 *
 * Note this is presentation only. It decides which screen to render; it is
 * never the thing that protects data. Every read and write is scoped by RLS in
 * 0002_merchant.sql, which holds even if this returns the wrong thing.
 */
export async function fetchUserRole(): Promise<UserRole> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { role: null, restaurantId: null, restaurantName: null };

  const { data, error } = await supabase
    .from("app_users")
    .select("role, restaurant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) return { role: null, restaurantId: null, restaurantName: null };

  const restaurantId = (data.restaurant_id as string | null) ?? null;
  let restaurantName: string | null = null;

  if (restaurantId) {
    const { data: restaurant } = await supabase
      .from("restaurants")
      .select("name")
      .eq("id", restaurantId)
      .maybeSingle();
    restaurantName = (restaurant?.name as string | null) ?? null;
  }

  return {
    role: data.role as AppRole,
    restaurantId,
    restaurantName,
  };
}

/**
 * Resolves where a freshly signed-in user should land, plus their role, in
 * one call. Both the password form and the OAuth callback do the same
 * role-based routing after authentication, so the decision lives here instead
 * of being reimplemented twice with two rule sets.
 *
 * Returns path: null when the account has no permitted surface — the session
 * is valid but the user is not provisioned, and callers must drop the session
 * rather than leave a browser holding credentials that can only fail.
 *
 * Like fetchUserRole this is presentation only; the gates and RLS are the
 * access control, and they re-check independently.
 */
export async function resolveRoleTarget(target: string | null): Promise<{
  path: string | null;
  role: AppRole;
  restaurantId: string | null;
}> {
  const { role, restaurantId } = await fetchUserRole();

  const path = roleTargetPath(role, restaurantId, target);

  return { path, role, restaurantId };
}
