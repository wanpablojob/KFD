"use client";

import { useSessionUser } from "@/lib/auth";
import { fetchMerchantProfile } from "@/lib/supabase/merchant-queries";
import { useAsyncData } from "@/lib/use-async-data";

export interface MerchantAccess {
  role: "admin" | "merchant" | null;
  restaurantName: string | null;
  restaurantId: string | null;
  loading: boolean;
  granted: boolean;
}

/**
 * Resolves the signed-in user's role and restaurant once, so pages do not each
 * re-query app_users. Admin accounts get access too, which keeps the existing
 * admin login usable on /merchant.
 */
export function useMerchantAccess(): MerchantAccess {
  const { user, loading: authLoading } = useSessionUser();
  const profile = useAsyncData(() => fetchMerchantProfile());

  if (authLoading || !user) {
    return {
      role: null,
      restaurantName: null,
      restaurantId: null,
      loading: true,
      granted: false,
    };
  }

  if (profile.loading) {
    return {
      role: null,
      restaurantName: null,
      restaurantId: null,
      loading: true,
      granted: false,
    };
  }

  const role = profile.data?.role ?? "merchant";
  const restaurantId = profile.data?.restaurantId ?? null;

  return {
    role,
    restaurantName: profile.data?.restaurantName ?? null,
    restaurantId,
    loading: false,
    granted: role === "admin" || restaurantId !== null,
  };
}
