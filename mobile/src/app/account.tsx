import { useEffect, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSession } from "../lib/session-context";
import { supabase } from "../lib/supabase";
import { disablePush, getPushStatus, type PushStatus } from "../lib/push";
import { shouldUnregisterOnSignOut } from "../lib/push-signout";
import { colors, radius, shadow, spacing, type } from "../lib/theme";

/**
 * Account home for admin sessions. Admin work happens in the web console, so
 * this is a notice and a sign-out. Merchants have their own surface
 * (app/merchant), riders and customers theirs.
 */
export default function AccountRoute() {
  const { user, role, leave } = useSession();
  const [push, setPush] = useState<PushStatus>({ granted: false, registered: false });

  useEffect(() => {
    if (!user) return;
    void getPushStatus().then(setPush);
  }, [user]);

  async function signOut() {
    // Keyed on `registered`, not on the toggle. The toggle asks "is push on?";
    // cleanup has to ask "does the server still hold a token for this device?",
    // and those disagree whenever the OS permission was changed outside the app
    // -- which left the device registered and delivered the previous user's
    // orders to whoever signed in next. See lib/push-signout.ts.
    if (user && shouldUnregisterOnSignOut(push)) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await disablePush(session.access_token);
      }
    }
    leave();
  }

  if (!user) return null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>KFD</Text>
          <Text style={styles.subtitle}>Kabankalan Food Delivery</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Account</Text>
          <Text style={styles.subtitle}>
            Signed in as <Text style={styles.bold}>{user.email}</Text>
          </Text>
          <Text style={styles.roleLabel}>
            Role: <Text style={styles.bold}>{role?.role}</Text>
          </Text>
          <Text style={styles.muted}>Use the KFD web console for admin work.</Text>
        </View>

        <Pressable style={styles.signOutButton} onPress={() => void signOut()}>
          <Text style={styles.signOutLabel}>Sign out</Text>
        </Pressable>
      </ScrollView>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  header: { alignItems: "center", gap: spacing.xs, marginBottom: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  title: { ...type.display, textAlign: "center" },
  subtitle: { ...type.body, color: colors.textMuted, textAlign: "center" },
  roleLabel: { ...type.body, color: colors.textMuted, textAlign: "center" },
  muted: { ...type.caption, color: colors.textFaint, textAlign: "center" },
  bold: { fontWeight: "800" },
  pushCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  pushCopy: { flex: 1, gap: spacing.xs },
  pushTitle: { ...type.heading, color: colors.text },
  pushMuted: { ...type.caption, color: colors.textMuted },
  signOutButton: {
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingVertical: spacing.lg,
    alignItems: "center",
    marginTop: spacing.md,
    ...shadow.card,
  },
  signOutLabel: { ...type.label, color: colors.danger, fontWeight: "700" },
});
