import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";
import { collapseAuthError } from "./auth-errors";

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(collapseAuthError(error.message) ?? error.message);
  }

  return data;
}

/**
 * Create a customer account. Email/password signup must produce a session
 * before registerCustomer() can run (Supabase may hold the account until the
 * link/OTP is confirmed), so callers should surface the returned session:
 * if it is null, the account needs confirmation before first sign-in.
 */
export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    throw new Error(collapseAuthError(error.message) ?? error.message);
  }
  return data;
}

/**
 * Start a provider OAuth exchange using the PKCE flow and, on native, hand
 * the browser to expo-web-browser, then exchange the returned code ourselves.
 *
 * The redirect target is the app's own scheme (kfd://…), which must be listed
 * in the project's Supabase Auth "Redirect URLs" allowlist. The scheme is
 * registered in app.json; the deep link lands back in the app at /auth/callback.
 *
 * Returns null when the user abandons the provider page — that is a cancel,
 * not an error, and callers should treat it as "stay on the sign-in screen".
 *
 * Google is the only provider enabled on the project; widen the union and add a
 * button only once the matching Supabase provider has real credentials.
 */
export async function signInWithProvider(provider: "google") {
  const redirectTo = AuthSession.makeRedirectUri({ path: "auth/callback" });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(
    data.url ?? redirectTo,
    redirectTo
  );
  if (result.type !== "success") return null;

  const code = new URL(result.url).searchParams.get("code");
  if (!code) throw new Error("Sign-in did not return a verification code.");

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;

  return result.url;
}

/**
 * Turn the signed-in auth identity into a customer (app_users). Idempotent on
 * the server: a no-op once the account has any role, so later provisions (a
 * rider or merchant upgrade) are never clobbered.
 */
export async function registerCustomer() {
  const { error } = await supabase.rpc("register_customer");
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSessionUser(): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Subscribe to Supabase auth state changes. Returns `null` while the initial
 * session is being restored (loading), then the user (or `null` if signed
 * out). The session is rehydrated from expo-secure-store, so a restart lands
 * straight back in here.
 */
export function useSessionUser(): { user: User | null; loading: boolean } {
  const [state, setState] = useState<{ user: User | null; loading: boolean }>({
    user: null,
    loading: true,
  });

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setState({
        user: data.session?.user ?? null,
        loading: false,
      });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      if (!active) return;
      setState({ user: session?.user ?? null, loading: false });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
