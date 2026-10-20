import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GcashQrForm } from "../../components/GcashQrForm";
import { useScrollBottomPadding } from "../../components/TabBarInset";
import { signOut } from "../../lib/auth";
import { useRiderEarningsSummary, useRiderProfile } from "../../lib/hooks";
import { useSession } from "../../lib/session-context";
import { supabase } from "../../lib/supabase";
import { requestRiderAccountDeletion } from "../../lib/storefront";
import { openLegal } from "../../lib/legal";
import { MerchantButton } from "../../components/MerchantUi";
import {
  RIDER_STATUSES,
  riderStatusMeta,
  type RiderStatus,
} from "../../lib/rider-status";
import {
  disablePush,
  enablePush,
  getPushStatus,
  watchForTokenRotation,
  type PushStatus,
} from "../../lib/push";
import { shouldUnregisterOnSignOut } from "../../lib/push-signout";
import { riderProfileGate } from "../../lib/rider-profile-gate";
import type { RiderProfile } from "../../lib/storefront";
import { colors, radius, shadow, spacing, type } from "../../lib/theme";

/**
 * Profile tab. Availability is the one write a rider makes about themselves,
 * an UPDATE on their own row via the rider_set_status RPC.
 */
export default function RiderProfileRoute() {
  const insets = useSafeAreaInsets();
  const bottomPadding = useScrollBottomPadding();
  const { user } = useSession();
  const profileQuery = useRiderProfile(user?.id ?? "");
  const { refetch } = profileQuery;
  const gate = riderProfileGate(profileQuery);
  // Ledger-derived, so these two lines cannot disagree with the Earnings tab.
  // See the comment where they render.
  const { data: earnings } = useRiderEarningsSummary();
  const [updating, setUpdating] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [push, setPush] = useState<PushStatus>({ granted: false, registered: false });
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    void getPushStatus().then(setPush);
  }, [user]);

  // Re-register a rotated Expo token in place, so a rider with alerts on does
  // not go silently deaf after a reinstall or permission change. Merchants
  // already get this on app/account.tsx; riders needed it here because their
  // surface had no push registration at all.
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

  // Unregister before signing out: the token is keyed to the account, and
  // without this the next person to sign in on this phone inherits the
  // previous rider's delivery alerts.
  //
  // Keyed on `registered`, not on the toggle being on. If the rider revoked
  // notifications in system settings, `granted` is false while the server still
  // holds this rider's token -- and skipping the DELETE there is exactly when
  // the leak this guards against happens. See lib/push-signout.ts.
  async function signOutAndUnregister() {
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

  // A rider account holds payouts and cash on hand, so it is closed by staff
  // after settling; the app records the request (0082, store requirement).
  function confirmDeletionRequest() {
    Alert.alert(
      "Delete your account?",
      "KFD will settle any payouts and cash you hold, then delete your account and personal details. You can keep delivering until then.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Request deletion",
          style: "destructive",
          onPress: () => {
            requestRiderAccountDeletion()
              .then((at) =>
                Alert.alert(
                  "Request received",
                  `We recorded your request on ${new Date(at).toLocaleDateString()}. KFD will contact you to settle up.`
                )
              )
              .catch((cause: unknown) =>
                Alert.alert(
                  "Could not send your request",
                  cause instanceof Error ? cause.message : "Try again."
                )
              );
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

  async function setStatus(status: RiderStatus) {
    setUpdating(true);
    setStatusError(null);
    const { error: rpcError } = await supabase.rpc("rider_set_status", {
      p_status: status,
    });
    if (rpcError) setStatusError(rpcError.message);
    else await refetch();
    setUpdating(false);
  }

  // Was the most correct of the three -- it did read its own query -- but the
  // gate below was still a two-way `!profile`, so a failed refetch with no
  // cached row would report "no rider profile" and offer to sign out. Now all
  // three screens share one decision. See lib/rider-profile-gate.ts.
  if (gate.kind === "loading") {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={type.caption}>Loading…</Text>
        <StatusBar style="dark" />
      </View>
    );
  }

  if (gate.kind === "error") {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={styles.error}>{gate.message}</Text>
        <View style={styles.signOut}>
          <MerchantButton
            label="Try again"
            tone="outline"
            onPress={() => void refetch()}
          />
        </View>
        <StatusBar style="dark" />
      </View>
    );
  }

  if (gate.kind === "missing") {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={styles.error}>No rider profile is linked to this account.</Text>
        <View style={styles.signOut}>
          <MerchantButton
            label="Sign out"
            tone="danger"
            onPress={() => void signOutAndUnregister()}
          />
        </View>
        <StatusBar style="dark" />
      </View>
    );
  }

  const profile = gate.profile as RiderProfile;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
      >
        <View style={[styles.header, { paddingTop: spacing.lg + insets.top }]}>
          <Text style={styles.title}>{profile.name}</Text>
          <Text style={styles.subtitle}>
            {profile.city} · {profile.vehicle}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Availability</Text>
          <View style={styles.statusButtons}>
            {RIDER_STATUSES.map((s) => {
              const active = profile.status === s;
              const meta = riderStatusMeta(s);
              return (
                <Pressable
                  key={s}
                  style={[
                    styles.statusButton,
                    active && styles.statusButtonActive,
                    updating && styles.disabled,
                  ]}
                  disabled={updating}
                  onPress={() => void setStatus(s)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active, disabled: updating }}
                  accessibilityLabel={`${meta.label}. ${meta.description}`}
                  accessibilityHint="Sets whether dispatch offers you deliveries"
                >
                  <Text
                    style={[
                      styles.statusButtonLabel,
                      active && styles.statusButtonLabelActive,
                    ]}
                  >
                    {meta.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {/* Names the consequence of the current status, because the buttons
              above are three words wide and cannot carry it. */}
          <Text style={styles.statusHint}>
            {riderStatusMeta(profile.status).description}
          </Text>
          {statusError ? <Text style={styles.error}>{statusError}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Delivery alerts</Text>
          <Text style={styles.pushCopy}>
            Get a notification when a new delivery is offered to you, and when a
            delivery finishes on another device. Without this you will not hear about
            offers while the app is closed — an offer only lasts a few minutes.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.pushRow, pressed && styles.pushRowPressed]}
            onPress={() => void togglePush()}
            disabled={pushBusy}
            accessibilityRole="switch"
            accessibilityState={{
              checked: push.granted && push.registered,
              disabled: pushBusy,
            }}
            accessibilityLabel="Delivery alerts"
            accessibilityHint="Notifications for new offers and completed deliveries"
          >
            <Text style={styles.meta}>
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
          {push.error ? <Text style={styles.error}>{push.error}</Text> : null}
        </View>

        <GcashQrForm
          riderId={profile.id}
          initialUrl={profile.gcash_qr_url}
          initialName={profile.gcash_name}
        />

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Account</Text>
          <Text style={styles.meta}>Deliveries: {earnings?.delivery_count ?? 0}</Text>
          <Text style={styles.meta}>Rating: {Number(profile.rating).toFixed(1)}</Text>
          <Text style={styles.meta}>
            Earnings: ₱{Number(earnings?.lifetime ?? 0).toFixed(2)}
          </Text>
          {/* Where these two numbers come from, so a rider comparing this screen
              with the Earnings tab is not looking at two different figures. Both
              sum the payout ledger; the riders row's own counters are not used
              here because they were never reset when the ledger replaced them. */}
          <Text style={styles.metaHint}>
            Counted from your recorded delivery payouts.
          </Text>
        </View>

        <View style={styles.legalRow}>
          <Pressable onPress={() => openLegal("support")} accessibilityRole="link">
            <Text style={styles.deleteLink}>Help & support</Text>
          </Pressable>
          <Pressable onPress={() => openLegal("privacy")} accessibilityRole="link">
            <Text style={styles.deleteLink}>Privacy</Text>
          </Pressable>
          <Pressable onPress={() => openLegal("terms")} accessibilityRole="link">
            <Text style={styles.deleteLink}>Terms</Text>
          </Pressable>
        </View>

        {/* The same button as the merchant Account tab, so signing out looks
            and sits the same in every surface. */}
        <View style={styles.signOut}>
          <MerchantButton
            label="Sign out"
            tone="danger"
            onPress={() => void signOutAndUnregister()}
          />
        </View>

        <Pressable onPress={confirmDeletionRequest} accessibilityRole="button">
          <Text style={styles.deleteLink}>Delete my account</Text>
        </Pressable>
      </ScrollView>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  header: { gap: spacing.xs },
  title: { ...type.display, fontSize: 26 },
  subtitle: { ...type.caption, color: colors.textMuted },
  section: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  sectionLabel: { ...type.eyebrow, color: colors.secondary },
  statusButtons: { flexDirection: "row", gap: spacing.sm },
  statusButton: {
    flex: 1,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
  },
  statusButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusButtonLabel: {
    ...type.label,
    color: colors.textMuted,
    textTransform: "capitalize",
  },
  statusButtonLabelActive: { color: colors.textInverse, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  pushCopy: { ...type.caption, color: colors.textMuted, marginBottom: spacing.xs },
  pushRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  pushRowPressed: { opacity: 0.6 },
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
  meta: { ...type.body, color: colors.textMuted },
  metaHint: { ...type.caption, color: colors.textFaint },
  statusHint: { ...type.caption, color: colors.textMuted },
  signOut: { flexDirection: "row" },
  legalRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  deleteLink: {
    ...type.caption,
    color: colors.textMuted,
    textDecorationLine: "underline",
  },
  error: { ...type.body, color: colors.danger },
});
