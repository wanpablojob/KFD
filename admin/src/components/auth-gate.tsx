"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { signOut, useSessionUser } from "@/lib/auth";
import { useUserRole } from "@/lib/use-user-role";

/**
 * Gates the admin console on role, not merely on having a session.
 *
 * This used to check only "is someone signed in", which meant any merchant
 * could load every admin screen. RLS still returned no rows, so nothing leaked
 * and the shell looked empty, but the console itself was not role-gated. The
 * role check now happens here as well as in the database.
 *
 * A merchant who lands here is sent to their own portal rather than signed
 * out; they are legitimately signed in, just in the wrong place. An account
 * with no app_users row at all is signed out, because there is no screen that
 * account is allowed to see.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading: authLoading } = useSessionUser();
  const { loading: roleLoading, isAdmin, provisioned, error } = useUserRole();

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    if (roleLoading) return;

    if (error) {
      router.replace("/login?error=lookup-failed");
      return;
    }

    if (isAdmin) return;

    if (provisioned) {
      router.replace("/merchant");
      return;
    }

    void signOut().catch(() => {});
    router.replace("/login?error=not-provisioned");
  }, [authLoading, user, roleLoading, isAdmin, provisioned, error, router]);

  if (authLoading || (user && roleLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Image
            src="/images/kabankalan/logo.jpg"
            alt="Kabankalan Food Delivery"
            width={48}
            height={48}
            className="animate-pulse"
          />
          <p className="text-sm text-muted-foreground">Checking access…</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  // Anything other than a confirmed admin is on its way out, so render nothing
  // rather than flashing the console shell at someone about to be redirected.
  if (!isAdmin) return null;

  return children;
}
