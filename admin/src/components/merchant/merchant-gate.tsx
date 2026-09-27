"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSessionUser } from "@/lib/auth";
import { useMerchantAccess } from "@/lib/use-merchant-access";
import { LoadingState } from "@/components/ui/status";
import { MerchantNav } from "./merchant-nav";

/**
 * Gates the merchant area on two conditions: a live session, and a role that
 * is allowed here. An authenticated user with no app_users row is signed out
 * rather than shown an empty dashboard, because a merchant with no restaurant
 * can do nothing and the empty state would just look broken.
 */
export function MerchantGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading: authLoading } = useSessionUser();
  const access = useMerchantAccess();

  useEffect(() => {
    if (authLoading || access.loading) return;

    if (!user) {
      router.replace("/merchant/login");
      return;
    }

    if (!access.granted) {
      // Valid session, no provisioned access. Sign out so the browser does not
      // keep a session that can only ever render an error.
      void import("@/lib/auth").then(({ signOut }) => signOut().catch(() => {}));
      router.replace("/merchant/login?error=no-access");
    }
  }, [authLoading, access.loading, access.granted, user, router]);

  if (authLoading || access.loading) {
    return (
      <div className="min-h-screen bg-background">
        <LoadingState label="Checking merchant access…" />
      </div>
    );
  }

  if (!user || !access.granted) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MerchantNav />
      <main>{children}</main>
    </div>
  );
}
