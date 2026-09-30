import { createContext, use, useEffect, useState, type PropsWithChildren } from "react";
import { useSessionUser, signOut, registerCustomer } from "./auth";
import { fetchUserRole, type UserRole } from "./role";

/**
 * Session + role context (SDK 57 protected-route pattern from the Expo Router
 * authentication guide).
 *
 * The raw auth hook only tells us who is signed in; the app also needs the
 * app_users role resolved before any role-bearing screen can render, because a
 * rider and a merchant/admin land on different surfaces. That resolution is
 * performed once here, in a provider wrapping the whole Navigator, so route
 * guards can read `role` synchronously without each screen refetching it.
 *
 * The provider is remounted per user (keyed by id in the root layout), which
 * resets role/error naturally when the session changes and avoids setting state
 * synchronously inside the effect (react-hooks/set-state-in-effect). Loading is
 * derived: while a signed-in user has no resolved role and no error, the
 * navigator shows the "Signing in…" screen.
 */
export interface Session {
  user: ReturnType<typeof useSessionUser>["user"];
  sessionLoading: boolean;
  role: UserRole | null;
  roleError: boolean;
  retryRole: () => void;
  leave: () => void;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const { user, loading: sessionLoading } = useSessionUser();
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleError, setRoleError] = useState(false);
  const [roleRetry, setRoleRetry] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchUserRole()
      .then((resolved) => {
        if (!active) return;
        if (resolved.role !== null) {
          setRole(resolved);
          return;
        }
        // A signed-in auth identity with no app_users row yet is a customer
        // choosing to self-sign up. register_customer() is idempotent, so
        // provisioned roles are never touched; only after registration still
        // yields no role is the session dropped (a genuinely failed account).
        void registerCustomer()
          .then(() => fetchUserRole())
          .then((again) => {
            if (!active) return;
            setRole(again);
            if (again.role === null) void signOut();
          })
          .catch(() => {
            if (active) void signOut();
          });
      })
      .catch(() => {
        if (active) setRoleError(true);
      });
    return () => {
      active = false;
    };
  }, [user, roleRetry]);

  const session: Session = {
    user,
    sessionLoading,
    role,
    roleError,
    retryRole: () => setRoleRetry((n) => n + 1),
    leave: () => void signOut(),
  };

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const value = use(SessionContext);
  if (!value) {
    throw new Error("useSession must be used inside a <SessionProvider />");
  }
  return value;
}
