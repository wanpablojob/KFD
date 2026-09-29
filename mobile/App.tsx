import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSessionUser, signOut } from "./src/lib/auth";
import { fetchUserRole, type UserRole } from "./src/lib/role";
import { LandingScreen, type LandingAction } from "./src/screens/landing-screen";
import { TrackOrderScreen } from "./src/screens/track-order-screen";
import { RiderHomeScreen } from "./src/screens/rider-home-screen";
import { LoginScreen } from "./src/screens/login-screen";

/**
 * Role-routed mobile shell.
 *
 * Signed-out the app has two entry points: public order tracking (track_order
 * is granted to anon, so no login) and rider sign-in. A rider account signs in
 * to the rider surface; admin/merchant accounts are told to use the web
 * console, because this app has no admin/merchant surface.
 */
export default function App() {
  const { user, loading: sessionLoading } = useSessionUser();
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<LandingAction | null>(null);

  useEffect(() => {
    if (!user) {
      setRole(null);
      return;
    }
    let active = true;
    setRoleLoading(true);
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

  if (sessionLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (!user) {
    // Signed out: two entry points. Tracking is public; rider opens the
    // login screen. Once signed in the rider surface replaces this landing.
    if (action === "track") {
      return (
        <TrackOrderScreen onBack={() => setAction(null)} />
      );
    }
    if (action === "rider") {
      return <LoginScreen onBack={() => setAction(null)} />;
    }
    return <LandingScreen onAction={setAction} />;
  }

  if (roleLoading || role === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <StatusBar style="dark" />
      </View>
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
      </ScrollView>
      <View style={styles.footer}>
        <Text
          style={styles.signOut}
          onPress={() => {
            void signOut();
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  content: { padding: 24, gap: 8 },
  title: { fontSize: 28, fontWeight: "700", color: "#111" },
  subtitle: { fontSize: 15, color: "#444" },
  roleLabel: { fontSize: 15, color: "#444" },
  muted: { fontSize: 14, color: "#888" },
  error: { fontSize: 14, color: "#b42318", marginTop: 12, textAlign: "center" },
  bold: { fontWeight: "700" },
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