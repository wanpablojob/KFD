"use client";

import { useSessionUser } from "@/lib/auth";
import { fetchUserRole, type AppRole } from "@/lib/role";
import { useAsyncData } from "@/lib/use-async-data";

export interface UserAccess {
  role: AppRole;
  restaurantId: string | null;
  restaurantName: string | null;
  loading: boolean;
  /** The account has an app_users row with either role. */
  provisioned: boolean;
  isAdmin: boolean;
  /** A merchant row that also has a restaurant attached. */
  isMerchant: boolean;
  /** A failed lookup, distinct from "no row" so a network blip is not a logout. */
  error: string | null;
}

const PENDING: UserAccess = {
  role: null,
  restaurantId: null,
  restaurantName: null,
  loading: true,
  provisioned: false,
  isAdmin: false,
  isMerchant: false,
  error: null,
};

/**
 * The single place role is resolved for the browser, shared by the admin gate,
 * the merchant gate, the merchant nav and the login redirect so they cannot
 * disagree about who the user is.
 */
export function useUserRole(): UserAccess {
  const { user, loading: authLoading } = useSessionUser();
  const userId = user?.id ?? null;

  // Keyed on the user id: the session resolves asynchronously, so an
  // unkeyed fetch on first render can beat it and cache a null role.
  const profile = useAsyncData(() => fetchUserRole(), userId ?? "anonymous");

  if (authLoading || !userId || profile.loading) return PENDING;

  if (profile.error) {
    return {
      ...PENDING,
      loading: false,
      error: profile.error,
    };
  }

  const role = profile.data?.role ?? null;
  const restaurantId = profile.data?.restaurantId ?? null;

  return {
    role,
    restaurantId,
    restaurantName: profile.data?.restaurantName ?? null,
    loading: false,
    provisioned: role !== null,
    isAdmin: role === "admin",
    isMerchant: role === "merchant" && restaurantId !== null,
    error: null,
  };
}
