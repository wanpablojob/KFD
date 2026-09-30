import { useEffect, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSession } from "../lib/session-context";
import { supabase } from "../lib/supabase";
import {
  disablePush,
  enablePush,
  getPushStatus,
  watchForTokenRotation,
  type PushStatus,
} from "../lib/push";
import { colors, radius, shadow, spacing, type } from "../lib/theme";

/**
 * Account home for admin/merchant/other non-rider sessions. This app has no
 * merchant or admin surface -- those logins point at the web console -- so the
 * screen is deliberately a notice plus the one mobile thing a merchant can do:
 * receive new-order push alerts on this device.
 */
export default function AccountRoute() {
  const { user, role, leave } = useSession();
  const [push, setPush] = useState<PushStatus>({ granted: false, registered: false });
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    void getPushStatus().then(setPush);
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
        const next = await enablePush(token);
        setPush(next);
      }
    } catch (cause) {
      setPush({
        granted: false,
        registered: false,
        error: cause instanceof Error ? cause.message : "Push failed. Try again.",
      });
    } finally {
      setPushBusy(false);
    }
  }

  async function signOut() {
    if (push.granted && push.registered && user) {
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
          <Text style={styles.muted}>
            This mobile app serves riders and customers. Use the web console for
            {role?.role === "merchant" ? " merchant" : " admin"} work.
          </Text>
        </View>

        {role?.role === "merchant" ? (
          <View style={styles.pushCard}>
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
