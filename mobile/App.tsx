import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSessionUser, signOut } from "./src/lib/auth";
import { fetchUserRole, type UserRole } from "./src/lib/role";
import { LoginScreen } from "./src/screens/login-screen";

export default function App() {
  const { user, loading: sessionLoading } = useSessionUser();
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    return <LoginScreen />;
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

  void role; // placeholder - surfaces come in the rider/customer steps

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>KFD</Text>
        <Text style={styles.subtitle}>
          Signed in as <Text style={styles.bold}>{user.email}</Text>
        </Text>
        <Text style={styles.roleLabel}>
          Role: <Text style={styles.bold}>{role.role ?? "unprovisioned"}</Text>
        </Text>
        {role.riderName ? (
          <Text style={styles.muted}>Rider: {role.riderName}</Text>
        ) : null}
        {role.restaurantName ? (
          <Text style={styles.muted}>{role.restaurantName}</Text>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <SignOutButton />
      </View>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

function SignOutButton() {
  return (
    <Text
      style={styles.signOut}
      onPress={() => {
        void signOut();
      }}
    >
      Sign out
    </Text>
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