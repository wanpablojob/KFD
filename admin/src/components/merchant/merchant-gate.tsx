"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { signOut, useSessionUser } from "@/lib/auth";
import { useUserRole } from "@/lib/use-user-role";
import { LoadingState } from "@/components/ui/status";
import { MerchantShell } from "./merchant-shell";

const MERCHANT_HOME = "/merchant";

/**
 * Gates the merchant area on two conditions: a live session, and a role that
 * is allowed here. Admins are let through so the portal can be reviewed from
 * the operations console.
 *
 * An account with no app_users row, or a merchant row with no restaurant
 * attached, is signed out rather than shown an empty dashboard, because there
 * is nothing that account can do and the empty state would just look broken.
 *
 * Failed lookups are not treated as "no access": a network blip should not
 * sign a merchant out mid-shift.
 */
export function MerchantGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading: authLoading } = useSessionUser();
  const {
    loading: roleLoading,
    isAdmin,
    isMerchant,
    provisioned,
    error,
  } = useUserRole();

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(MERCHANT_HOME)}`);
      return;
    }

    if (roleLoading) return;

    if (error) {
      router.replace(`/login?error=lookup-failed&next=${encodeURIComponent(MERCHANT_HOME)}`);
      return;
    }

    if (isAdmin || isMerchant) return;

    void signOut().catch(() => {});
    router.replace(
      provisioned
        ? `/login?error=no-restaurant&next=${encodeURIComponent(MERCHANT_HOME)}`
        : `/login?error=not-provisioned&next=${encodeURIComponent(MERCHANT_HOME)}`
    );
  }, [authLoading, user, roleLoading, isAdmin, isMerchant, provisioned, error, router]);

  if (authLoading || (user && roleLoading)) {
    return (
      <div className="min-h-screen bg-background">
        <LoadingState label="Checking merchant access…" />
      </div>
    );
  }

  if (!user || (!isAdmin && !isMerchant)) return null;

  return (
    <MerchantShell>
      {children}
    </MerchantShell>
  );
}
