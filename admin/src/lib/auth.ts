import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase/client";
import { safeNextPath } from "./safe-next";

export type AuthUser = User;

export interface SessionState {
  session: Session | null;
  user: User | null;
}

/**
 * Supabase reports "no such account" and "wrong password" as distinguishable
 * messages in some responses. Echoing that back turns the login form into an
 * account-enumeration oracle, so collapse them into one reply that reveals
 * nothing about which half was wrong.
 */
const CREDENTIAL_FAILURES = ["invalid login credentials", "email not confirmed"];

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    const detail = error.message.toLowerCase();

    if (CREDENTIAL_FAILURES.some((failure) => detail.includes(failure))) {
      throw new Error("Incorrect email or password.");
    }

    throw error;
  }

  return data;
}

/**
 * Start the Google OAuth exchange using the default implicit flow.
 *
 * The provider redirects the browser to the callback page with the session
 * tokens in the URL hash; the browser client's `detectSessionInUrl` (on by
 * default) picks them up, and that page routes the user by role the same way
 * the password form does. The `?next=` param rides along in the query string
 * so a deep link survives the round trip, and is run through safeNextPath on
 * arrival like every other post-login redirect.
 *
 * `redirectTo` has to be absolute and must be listed in the project's Supabase
 * Auth redirect allowlist, alongside the local dev origin.
 */
export async function signInWithGoogle(next: string | null) {
  if (typeof window === "undefined") {
    throw new Error("Google sign-in is not available during server rendering.");
  }

  const target = safeNextPath(next);
  const query = target ? `?next=${encodeURIComponent(target)}` : "";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback${query}`,
    },
  });

  if (error) throw error;

  return data;
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
 * session is being resolved (loading), then the user (or `null` if signed out).
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
    } = supabase.auth.onAuthStateChange((_event, session) => {
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