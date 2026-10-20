import { useCallback, useEffect, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScrollBottomPadding } from "../../components/TabBarInset";
import { useSession } from "../../lib/session-context";
import { signOut } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import {
  disablePush,
  enablePush,
  getPushStatus,
  watchForTokenRotation,
  type PushStatus,
} from "../../lib/push";
import { deleteMyAccount } from "../../lib/storefront";
import { clearAddresses, loadAddresses } from "../../lib/addresses";
import { openLegal } from "../../lib/legal";
import { shouldUnregisterOnSignOut } from "../../lib/push-signout";
import { colors, radius, shadow, spacing, type } from "../../lib/theme";

/**
 * Customer profile: who you are signed in as, what you have ordered, and the
 * way out. The session user is the source of truth for the email -- there is
 * no customers table to drift from.
 *
 * The rider's contact number belongs to each delivery address, not the
 * account. Checkout copies the chosen address's number onto the order.
 */
export default function CustomerAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPadding = useScrollBottomPadding();
  const { user } = useSession();

  const email = user?.email ?? "";
  const name =
    typeof user?.user_metadata?.name === "string" && user.user_metadata.name
      ? user.user_metadata.name
      : email.split("@")[0] || "Customer";

  const [push, setPush] = useState<PushStatus>({ granted: false, registered: false });
  const [pushBusy, setPushBusy] = useState(false);
  const [addressCount, setAddressCount] = useState(0);

  // Recount on focus: the address screen is pushed on top of this one, so the
  // count has to refresh when the customer comes back.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      void loadAddresses(user.id).then((rows) => {
        if (active) setAddressCount(rows.length);
      });
      return () => {
        active = false;
      };
    }, [user])
  );

  useEffect(() => {
    if (!user) return;
    void getPushStatus().then(setPush);
  }, [user]);

  // Re-register a rotated Expo token in place, so a customer with alerts on does
  // not go silently deaf after a reinstall or permission change. Same wiring as
  // the rider profile screen.
  useEffect(() => {
    if (!push.registered) return;
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
  }, [push.registered]);

  async function signOutAndUnregister() {
    // Keyed on `registered`, not on the toggle. Revoking notifications in system
    // settings clears the OS permission while the server keeps the token, and
    // skipping the DELETE there hands this customer's order alerts to whoever
    // signs in next on the handset. See lib/push-signout.ts.
    if (shouldUnregisterOnSignOut(push)) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await disablePush(session.access_token).catch(() => {
          // Best-effort: a stale row is replaced on the next register.
        });
      }
    }
    await signOut();
  }

  function confirmDeleteAccount() {
    Alert.alert(
      "Delete your account?",
      "Your login and saved delivery addresses are removed. Past orders stay in KFD's records without your name. This cannot be undone.",
      [
        { text: "Keep account", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await deleteMyAccount();
              } catch (cause) {
                const message =
                  cause && typeof cause === "object" && "message" in cause
                    ? String((cause as { message: unknown }).message)
                    : "Try again in a moment.";
                Alert.alert("Could not delete your account", message);
                return;
              }
              if (user) await clearAddresses(user.id).catch(() => {});
              // The login is gone; this clears push registration and the
              // local session, tolerating the now-invalid token.
              await signOutAndUnregister().catch(() => {});
            })();
          },
        },
      ]
    );
  }

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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.list,
        { paddingTop: spacing.lg + insets.top, paddingBottom: bottomPadding },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={type.title}>{name}</Text>
        {email ? <Text style={type.caption}>{email}</Text> : null}
        <View style={styles.rolePill}>
          <Text style={styles.roleText}>CUSTOMER</Text>
        </View>
      </View>

      <View style={[styles.card, shadow.card]}>
        <Row
          label="Delivery addresses"
          hint={
            addressCount > 0
              ? `${addressCount} saved. Tap one at checkout instead of typing it.`
              : "Save your home or usual spot so checkout is one tap."
          }
          onPress={() => router.push("/customer/addresses" as never)}
        />
      </View>

      <View style={[styles.card, shadow.card, styles.pushCard]}>
        <View style={styles.fieldHead}>
          <Text style={styles.rowLabel}>Order notifications</Text>
          <Text style={styles.hint}>
            A push when your order is confirmed, on the way, or delivered.
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.pushRow, pressed && styles.rowPressed]}
          onPress={() => void togglePush()}
          disabled={pushBusy}
          accessibilityRole="switch"
          accessibilityState={{ checked: push.granted && push.registered }}
        >
          <Text style={styles.pushState}>
            {push.granted && push.registered ? "On" : "Off"}
          </Text>
          <View
            style={[
              styles.switchTrack,
              push.granted && push.registered && styles.switchTrackOn,
            ]}
          >
            <Text style={styles.switchHint}>{pushBusy ? "…" : ""}</Text>
          </View>
        </Pressable>
        {push.error ? <Text style={styles.pushError}>{push.error}</Text> : null}
      </View>

      <View style={[styles.card, shadow.card]}>
        <Row
          label="Your orders"
          hint="Track a past or active order"
          onPress={() => router.push("/customer/orders" as never)}
        />
        <View style={styles.divider} />
        <Row
          label="Track by reference"
          hint="Track any order with its KFD code"
          onPress={() => router.push("/track" as never)}
        />
        <View style={styles.divider} />
        {/* The earning side of the app, reached from the customer account. A
            signed-in rider never sees this row because /rider protects its own
            tabs, and submit_rider_application() refuses an existing rider. */}
        <Row
          label="Apply to deliver"
          hint="Ride with KFD and get paid per delivery"
          onPress={() => router.push("/rider-apply" as never)}
        />
        <View style={styles.divider} />
        <Row
          label="Help & support"
          hint="Contact KFD about an order or your account"
          onPress={() => openLegal("support")}
        />
        <View style={styles.divider} />
        <Row
          label="Privacy policy"
          hint="What KFD keeps about you and why"
          onPress={() => openLegal("privacy")}
        />
        <View style={styles.divider} />
        <Row
          label="Terms & conditions"
          hint="The rules for ordering with KFD"
          onPress={() => openLegal("terms")}
        />
      </View>

      <Pressable
        style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
        onPress={() => void signOutAndUnregister()}
        accessibilityRole="button"
      >
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>

      <Pressable
        style={styles.deleteAccount}
        onPress={confirmDeleteAccount}
        accessibilityRole="button"
      >
        <Text style={styles.deleteAccountLabel}>Delete my account</Text>
      </Pressable>

      <Text style={styles.version}>Kabankalan Food Delivery</Text>
    </ScrollView>
  );
}

function Row({
  label,
  hint,
  onPress,
}: {
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  header: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.lg },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  avatarText: { fontSize: 30, fontWeight: "800", color: colors.gold },
  rolePill: {
    marginTop: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  roleText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.primary,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  rowPressed: { opacity: 0.6 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { ...type.heading, fontSize: 15 },
  rowHint: { ...type.caption, color: colors.textFaint },
  fieldHead: { gap: 2, paddingTop: spacing.lg },
  hint: { ...type.caption, color: colors.textFaint },
  divider: { height: 1, backgroundColor: colors.border },
  pushCard: { paddingBottom: spacing.lg },
  pushRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  pushState: { ...type.body, color: colors.textMuted },
  switchTrack: {
    minWidth: 46,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  switchTrackOn: { backgroundColor: colors.primary },
  switchHint: { ...type.caption, color: colors.textInverse },
  pushError: { ...type.caption, color: colors.danger },
  deleteAccount: { alignItems: "center", paddingVertical: spacing.md },
  deleteAccountLabel: {
    ...type.caption,
    color: colors.danger,
    textDecorationLine: "underline",
  },
  signOut: {
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  signOutPressed: { backgroundColor: colors.dangerSoft },
  signOutLabel: { fontSize: 15, fontWeight: "700", color: colors.danger },
  version: { ...type.caption, color: colors.textFaint, textAlign: "center" },
});
