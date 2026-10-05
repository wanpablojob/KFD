import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { signOut } from "../../lib/auth";
import { useRiderEarningsSummary, useRiderProfile } from "../../lib/hooks";
import { useSession } from "../../lib/session-context";
import { supabase } from "../../lib/supabase";
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
import { colors, radius, shadow, spacing, type } from "../../lib/theme";

/**
 * Profile tab. Availability is the one write a rider makes about themselves,
 * an UPDATE on their own row via the rider_set_status RPC.
 */
export default function RiderProfileRoute() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { data: profile, isLoading, error, refetch } = useRiderProfile(user?.id ?? "");
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
  async function signOutAndUnregister() {
    if (push.granted && push.registered) {
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

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={type.caption}>Loading…</Text>
        <StatusBar style="dark" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={styles.error}>
          {error instanceof Error ? error.message : "Failed to load profile."}
        </Text>
        <StatusBar style="dark" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={styles.error}>No rider profile is linked to this account.</Text>
        <Pressable style={styles.signOut} onPress={() => void signOutAndUnregister()}>
          <Text style={styles.signOutLabel}>Sign out</Text>
        </Pressable>
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
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

        <Pressable
          style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
          onPress={() => void signOutAndUnregister()}
        >
          <Text style={styles.signOutLabel}>Sign out</Text>
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
  signOut: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  signOutPressed: { backgroundColor: colors.dangerSoft },
  signOutLabel: { color: colors.danger, fontSize: 14, fontWeight: "600" },
  error: { ...type.body, color: colors.danger },
});
