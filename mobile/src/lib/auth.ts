import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/**
 * Supabase reports "no such account" and "wrong password" as distinguishable
 * messages in some responses. Echoing that back turns the login form into an
 * account-enumeration oracle, so collapse them into one reply that reveals
 * nothing about which half was wrong. Mirrors admin/src/lib/auth.ts.
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