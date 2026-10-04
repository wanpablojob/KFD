import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { signOut } from "../lib/auth";
import { offerWindowLabel } from "../lib/offer-window";
import {
  useAcceptOffer,
  useDeclineOffer,
  useRiderOffers,
  useRiderProfile,
} from "../lib/hooks";
import { colors, radius, spacing, type } from "../lib/theme";
import type { RiderOffer } from "../lib/hooks";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** An offer on a cancelled order is still shown, but it cannot be accepted. */
const UNCLAIMABLE = ["delivered", "cancelled"];

function secondsLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000));
}

function countdown(expiresAt: string, now: number): string {
  const s = secondsLeft(expiresAt, now);
  if (s <= 0) return "expired";
  if (s < 60) return `${s}s left`;
  return `${Math.floor(s / 60)}m ${s % 60}s left`;
}

/**
 * "3 waiting. Offers expire in 5 minutes."
 *
 * The window is read off the offers rather than written here. It used to be the
 * literal "5 minutes", which was a second source of truth for a number the
 * server owns: retune the window in 0045 and this sentence would keep claiming
 * five minutes above a countdown counting down from something else. When the
 * window cannot be determined -- no offers, or offers that disagree because the
 * server changed it mid-flight -- the count is still worth stating and the
 * window is left off rather than guessed.
 */
function offerSummary(offers: readonly RiderOffer[]): string {
  const count = offers.length;
  const waiting = `${count} waiting`;
  const window = offerWindowLabel(offers);
  return window ? `${waiting}. Offers expire in ${window}.` : `${waiting}.`;
}

/**
 * Available deliveries tab.
 *
 * This is the rider half of dispatch. The offer side of the schema has existed
 * since 0035 and claim_order/decline_order have worked since Phase 1, but there
 * was no way for a rider to see an offer: nothing in the app read order_offers,
 * so the queue a dispatcher created was invisible. migration 0045 adds the read.
 *
 * An offer is not an assignment. The rider accepts or declines, and a declined
 * offer goes back to the system to offer the next rider in rotation. Accepting
 * freezes the payout onto the order and hands it to the Deliveries tab.
 *
 * Polls every 10s (see useRiderOffers): offers expire, so a list that only
 * loaded on mount would show a countdown that quietly lies.
 */
export function RiderOffersScreen({ userId }: { userId: string }) {
  const insets = useSafeAreaInsets();
  const { data: offers, error, isPending, refetch } = useRiderOffers();
  const { data: profile } = useRiderProfile(userId);
  const accept = useAcceptOffer();
  const decline = useDeclineOffer();

  // Drives the per-card countdown. One shared clock rather than a timer per card.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function onAccept(offer: RiderOffer) {
    if (busyId) return;
    setBusyId(offer.orderId);
    setActionError(null);
    try {
      await accept.mutateAsync(offer.orderId);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not accept.");
      await refetch();
    } finally {
      setBusyId(null);
    }
  }

  async function onDecline(offer: RiderOffer) {
    if (busyId) return;
    setBusyId(offer.orderId);
    setActionError(null);
    try {
      await decline.mutateAsync(offer.orderId);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not decline.");
      await refetch();
    } finally {
      setBusyId(null);
    }
  }

  if (isPending) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={type.caption}>Loading…</Text>
        <StatusBar style="dark" />
      </View>
    );
  }

  if (profile === null) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={styles.error}>No rider profile is linked to this account.</Text>
        <Pressable style={styles.linkButton} onPress={() => void signOut()}>
          <Text style={styles.linkLabel}>Sign out</Text>
        </Pressable>
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={offers ?? []}
        keyExtractor={(o) => String(o.offerId)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={
          <View style={[styles.sectionHeader, { paddingTop: spacing.lg + insets.top }]}>
            <View>
              <Text style={styles.sectionTitle}>Available</Text>
              <Text style={styles.subtitle}>
                {(offers ?? []).length === 0
                  ? "Nothing on offer right now."
                  : offerSummary(offers ?? [])}
              </Text>
            </View>
            <ActivityIndicator size="small" color={colors.textFaint} />
          </View>
        }
        ListEmptyComponent={
          // Same reasoning as the deliveries tab: say why it is empty rather
          // than showing a blank list that reads like a broken screen.
          error ? (
            <Text style={styles.error}>{error.message}</Text>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No deliveries on offer</Text>
              <Text style={styles.emptyBody}>
                Turn on your availability on the Profile tab. When an order comes in
                near you it will appear here to accept.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const expired = secondsLeft(item.expiresAt, now) <= 0;
          const claimable = !expired && !UNCLAIMABLE.includes(item.orderStatus);
          const busy = busyId === item.orderId;
          return (
            <View style={[styles.card, !claimable && styles.cardStale]}>
              <View style={styles.cardHeader}>
                <Text style={styles.ref}>{item.reference}</Text>
                <View style={styles.headerRight}>
                  <Text style={styles.orderStatus}>
                    {STATUS_LABEL[item.orderStatus] ?? item.orderStatus}
                  </Text>
                  <Text style={[styles.countdown, expired && styles.countdownGone]}>
                    {countdown(item.expiresAt, now)}
                  </Text>
                </View>
              </View>

              <Text style={styles.restaurant}>{item.restaurant}</Text>

              <View style={styles.block}>
                <Text style={styles.blockLabel}>Pick up &amp; deliver to</Text>
                <Text style={styles.blockValue}>
                  {item.restaurant}
                  {item.deliveryAddress ? `\n${item.deliveryAddress}` : ""}
                </Text>
                {item.customer ? (
                  <Text style={styles.noPhone}>Customer: {item.customer}</Text>
                ) : null}
              </View>

              <View style={styles.block}>
                <Text style={styles.blockLabel}>Items</Text>
                {item.items.length === 0 ? (
                  <Text style={styles.noPhone}>Not listed</Text>
                ) : (
                  item.items.map((line, index) => (
                    <Text key={`${line.name}-${index}`} style={styles.blockValue}>
                      {line.quantity}× {line.name}
                    </Text>
                  ))
                )}
              </View>

              <View style={styles.footer}>
                <Text style={styles.payout}>
                  {item.payoutPerDelivery !== null
                    ? `Earn ₱${Number(item.payoutPerDelivery).toFixed(2)}`
                    : "Fee pending"}
                </Text>
                <Text style={styles.total}>
                  Customer pays ₱{Number(item.total).toFixed(2)}
                </Text>
              </View>

              <View style={styles.actions}>
                <Pressable
                  style={[styles.declineButton, (busy || expired) && styles.disabled]}
                  disabled={busy || expired}
                  accessibilityRole="button"
                  accessibilityLabel={`Decline ${item.reference}`}
                  onPress={() => void onDecline(item)}
                >
                  <Text style={styles.declineLabel}>Decline</Text>
                </Pressable>
                <Pressable
                  style={[styles.acceptButton, (!claimable || busy) && styles.disabled]}
                  disabled={!claimable || busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Accept ${item.reference}`}
                  onPress={() => void onAccept(item)}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.textInverse} size="small" />
                  ) : (
                    <Text style={styles.acceptLabel}>
                      {expired ? "Expired" : "Accept"}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          );
        }}
        ListFooterComponent={
          actionError ? (
            <Text style={styles.error}>{actionError}</Text>
          ) : (
            <Pressable
              style={styles.callRow}
              onPress={() => void Linking.openURL("tel:")}
            >
              <Text style={styles.noPhone}>Rider support</Text>
            </Pressable>
          )
        }
      />
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
  linkButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  linkLabel: { ...type.label, color: colors.primary },
  disabled: { opacity: 0.45 },
  error: { ...type.body, color: colors.danger },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...type.heading, fontSize: 17 },
  subtitle: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  empty: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: { ...type.heading, color: colors.text },
  emptyBody: {
    ...type.caption,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardStale: { opacity: 0.6 },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerRight: { alignItems: "flex-end" },
  ref: { ...type.heading, color: colors.primary },
  orderStatus: { ...type.label, color: colors.secondary },
  countdown: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  countdownGone: { color: colors.danger },
  restaurant: { ...type.body, color: colors.textMuted },
  block: { gap: 2, marginTop: spacing.sm },
  blockLabel: {
    ...type.caption,
    color: colors.textFaint,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  blockValue: { ...type.body, color: colors.text },
  noPhone: { ...type.caption, color: colors.textFaint },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  payout: { ...type.body, color: colors.text, fontWeight: "700" },
  total: { ...type.caption, color: colors.textFaint },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  declineButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  declineLabel: { ...type.label, color: colors.textMuted },
  acceptButton: {
    flex: 2,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  acceptLabel: { ...type.label, color: colors.textInverse },
  callRow: { marginTop: spacing.md, alignItems: "center" },
});
