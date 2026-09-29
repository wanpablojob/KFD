import { supabase } from "./supabase";

export type AppRole = "admin" | "merchant" | "rider" | "customer" | null;

export interface UserRole {
  role: AppRole;
  restaurantId: string | null;
  restaurantName: string | null;
  riderId: string | null;
  riderName: string | null;
}

/**
 * Resolves the signed-in user's role from app_users.
 *
 * A row in app_users means authorised, no row means unprovisioned. There is
 * deliberately no default role: a missing row must read as "not provisioned",
 * never as a fallback, because defaulting upward would hand the whole platform
 * to anyone who can create an auth user. Mirrors admin/src/lib/role.ts.
 *
 * Note this is presentation only. It decides which screen to render; it is
 * never the thing that protects data. Every read and write is scoped by RLS in
 * the database, which holds even if this returns the wrong thing.
 */
export async function fetchUserRole(): Promise<UserRole> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return emptyRole();

  const { data, error } = await supabase
    .from("app_users")
    .select("role, restaurant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) return emptyRole();

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

  let riderId: string | null = null;
  let riderName: string | null = null;

  if (data.role === "rider") {
    const { data: rider } = await supabase
      .from("riders")
      .select("id, name")
      .eq("user_id", user.id)
      .maybeSingle();
    riderId = (rider?.id as string | null) ?? null;
    riderName = (rider?.name as string | null) ?? null;
  }

  return {
    role: data.role as AppRole,
    restaurantId,
    restaurantName,
    riderId,
    riderName,
  };
}

function emptyRole(): UserRole {
  return {
    role: null,
    restaurantId: null,
    restaurantName: null,
    riderId: null,
    riderName: null,
  };
}