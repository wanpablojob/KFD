import { useEffect, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Switch,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSessionUser, signOut } from "./src/lib/auth";
import { fetchUserRole, type UserRole } from "./src/lib/role";
import { supabase } from "./src/lib/supabase";
import { LoadingScreen } from "./src/screens/loading-screen";
import { LandingScreen, type LandingAction } from "./src/screens/landing-screen";
import { RiderHomeScreen } from "./src/screens/rider-home-screen";
import { LoginScreen } from "./src/screens/login-screen";
import {
  disablePush,
  enablePush,
  getPushStatus,
  watchForTokenRotation,
  type PushStatus,
} from "./src/lib/push";

/**
 * Role-routed mobile shell.
 *
 * Signed-out the app shows a pixel-theme landing with a single decision:
 * sign in. Accounts are resolved to a role from app_users after login: a rider
 * lands on the rider surface; admin/merchant accounts are told to use the web
 * console, because this app has no admin/merchant surface. (Customers track
 * orders on web by reference; track_order stays in the backend, this app is
 * account-first.)
 */
export default function App() {
  const { user, loading: sessionLoading } = useSessionUser();
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<LandingAction | null>(null);
  const [push, setPush] = useState<PushStatus>({ granted: false, registered: false });
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (!user) {
      setRole(null);
      return;
    }
    let active = true;
    setRoleLoading(true);
    void getPushStatus().then(setPush);
    fetchUserRole()
      .then((resolved) => {
        if (!active) return;
        setRole(resolved);
        if (resolved.role === null) {
          // Signed in but not provisioned. The web app drops the session
          // here rather than leave a browser holding credentials that can
          // only fail; mirror that.
          setError(
            `No app account is linked to ${user.email}. Ask an administrator to provision it.`
          );
          void signOut();
        } else {
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Failed to load role.");
      })
      .finally(() => {
        if (active) setRoleLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  // Re-register a rotated Expo token in place so a merchant with alerts on does
  // not go silently deaf after a reinstall or permission change.
  useEffect(() => {
    if (role?.role !== "merchant" || !push.registered) return;
    let active = true;
    let subscription: { remove: () => void } | null = null;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active || !session?.access_token) return;
      subscription = watchForTokenRotation(session.access_token, () => {
        if (active) setPush({ granted: true, registered: true });
      });
    });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [role, push.registered]);

  if (sessionLoading) {
    return <LoadingScreen message="Restoring session…" />;
  }

  if (!user) {
    // Signed out: one entry point -- the shared sign-in opens LoginScreen.
    if (action === "login") {
      return <LoginScreen onBack={() => setAction(null)} />;
    }
    return <LandingScreen onAction={setAction} />;
  }

  if (roleLoading || role === null) {
    return (
      <LoadingScreen message={error ?? "Signing in…"} />
    );
  }

  if (role.role === "rider") {
    return (
      <RiderHomeScreen
        userId={user.id}
        onBackToLanding={() => {
          // Only reachable when no rider profile is linked, in which case we
          // drop the session rather than leave it dangling.
        }}
      />
    );
  }

  // admin / merchant: no mobile surface in this app.
  async function togglePush() {
    if (!user || pushBusy) return;
    setPushBusy(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      if (push.granted && push.registered) {
        await disablePush(token);
        setPush({ granted: false, registered: false });
      } else {
        setPush(await enablePush(token));
      }
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>KFD</Text>
        <Text style={styles.subtitle}>
          Signed in as <Text style={styles.bold}>{user.email}</Text>
        </Text>
        <Text style={styles.roleLabel}>
          Role: <Text style={styles.bold}>{role.role}</Text>
        </Text>
        <Text style={styles.muted}>
          This mobile app serves riders and customers. Use the web console for
          {role.role === "merchant" ? " merchant" : " admin"} work.
        </Text>

        {role.role === "merchant" ? (
          <View style={styles.pushRow}>
            <View style={styles.pushCopy}>
              <Text style={styles.pushTitle}>Order alerts</Text>
              <Text style={styles.pushMuted}>
                {push.error
                  ? push.error
                  : push.granted && push.registered
                    ? "This device receives new-order alerts."
                    : "Get a push when a new order is placed."}
              </Text>
            </View>
            <Switch
              value={push.granted && push.registered}
              onValueChange={() => void togglePush()}
              disabled={pushBusy}
            />
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <Text
          style={styles.signOut}
          onPress={() => {
            void (async () => {
              if (push.granted && push.registered) {
                const {
                  data: { session },
                } = await supabase.auth.getSession();
                if (session?.access_token) {
                  await disablePush(session.access_token);
                }
              }
              await signOut();
            })();
          }}
        >
          Sign out
        </Text>
      </View>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24, gap: 8 },
  title: { fontSize: 28, fontWeight: "700", color: "#111" },
  subtitle: { fontSize: 15, color: "#444" },
  roleLabel: { fontSize: 15, color: "#444" },
  muted: { fontSize: 14, color: "#888" },
  bold: { fontWeight: "700" },
  pushRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d1d1d1",
    borderRadius: 12,
    backgroundColor: "#fafafa",
    gap: 12,
  },
  pushCopy: { flex: 1, gap: 2 },
  pushTitle: { fontSize: 15, fontWeight: "700", color: "#111" },
  pushMuted: { fontSize: 13, color: "#666" },
  footer: {
    padding: 24,
    paddingBottom: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e2e2",
  },
  signOut: {
    color: "#b42318",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
});