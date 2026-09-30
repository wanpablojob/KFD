import { useEffect } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { LoadingScreen } from "../../screens/loading-screen";

/**
 * OAuth callback (kfd://auth/callback). Only reached on the cold-start path:
 * `signInWithProvider` normally keeps the WebBrowser session open and exchanges
 * the PKCE code itself. If the provider redirect lands here instead, swap the
 * code for a session and fold back into the role router, which re-renders into
 * the right surface automatically.
 */
export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string; error?: string }>();

  useEffect(() => {
    if (typeof params.error === "string" && params.error) {
      router.replace("/login");
      return;
    }
    if (typeof params.code !== "string" || !params.code) {
      router.replace("/login");
      return;
    }
    let active = true;
    void supabase.auth
      .exchangeCodeForSession(params.code)
      .then(() => {
        if (active) router.replace("/");
      })
      .catch(() => {
        if (active) router.replace("/login");
      });
    return () => {
      active = false;
    };
  }, [params.code, params.error]);

  return <LoadingScreen message="Finishing sign-in…" />;
}
