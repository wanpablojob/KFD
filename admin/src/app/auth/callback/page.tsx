"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { resolveRoleTarget } from "@/lib/role";
import { signOut } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-next";

/**
 * Where Google returns the browser after authorization.
 *
 * The provider lands here with the session tokens in the URL hash (implicit
 * flow). The supabase browser client detects and stores them on init, so the
 * first thing this page does is wait for the recovered session, then route the
 * user by role exactly like the password form. The page renders nothing but a
 * brief transition screen; navigation happens as fast as auth lets it.
 *
 * Two failure paths, both explicit because a silent bounce feels like a bug:
 *   - the provider refused (user cancelled, misconfigured client, ...) ->
 *     back to /login with an oauth message
 *   - the account has no app_users row -> the same not-provisioned flow the
 *     password form uses, including dropping the session, so a valid Google
 *     login can never hold the browser hostage behind the gates.
 */
export default function AuthCallbackPage() {
  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams(window.location.search);
    const target = safeNextPath(params.get("next"));

    async function finish() {
      if (params.get("error")) {
        window.location.replace("/login?error=oauth-failed");
        return;
      }

      // Force the client to initialise and pick the tokens out of the hash.
      // In the implicit flow they were written to the URL, not to storage.
      await supabase.auth.getSession();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.replace("/login?error=oauth-failed");
        return;
      }

      const { path, role } = await resolveRoleTarget(target);

      if (path) {
        window.location.replace(path);
        return;
      }

      // Authenticated but not provisioned: release the session so the browser
      // does not sit on credentials that can only ever hit the gates.
      await signOut().catch(() => {});
      window.location.replace(
        role === "merchant"
          ? "/login?error=no-restaurant"
          : "/login?error=not-provisioned",
      );
    }

    finish().catch(() => {
      if (!cancelled) window.location.replace("/login?error=lookup-failed");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <div
        role="status"
        className="flex flex-col items-center gap-3 text-muted-foreground"
      >
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
        <p className="text-sm">Completing sign-in…</p>
      </div>
    </main>
  );
}