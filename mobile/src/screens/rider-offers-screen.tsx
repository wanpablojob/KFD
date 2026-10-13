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
import { useScrollBottomPadding } from "../components/TabBarInset";
import { signOut } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { offerWindowLabel } from "../lib/offer-window";
import { isOfferClaimable, secondsUntilExpiry } from "../lib/offer-claimable";
import { riderStatusMeta } from "../lib/rider-status";
import { deviceMapsUrl, openInMaps } from "../lib/maps";
import { useConnectivity } from "../lib/connectivity-context";
import { riderProfileGate } from "../lib/rider-profile-gate";
import {
  useAcceptOffer,
  useDeclineOffer,
  useRiderOffers,
  useRiderProfile,
} from "../lib/hooks";
import { colors, radius, spacing, type } from "../lib/theme";
import type { RiderOffer } from "../lib/hooks";
import type { RiderProfile } from "../lib/storefront";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/**
 * "An offer on a delivered or cancelled order is still shown, but it cannot be
 * accepted" -- the rule itself lives in lib/offer-claimable.ts, shared with the
 * tab badge so the number on the tab can never promise work this list refuses.
 */
function countdown(expiresAt: string, now: number): string {
  const s = secondsUntilExpiry(expiresAt, now);
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
  const bottomPadding = useScrollBottomPadding();
  const { data: offers, error, isPending, refetch } = useRiderOffers();
  const profileQuery = useRiderProfile(userId);
  const { refetch: refetchProfile } = profileQuery;
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
  const [goingOnline, setGoingOnline] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const connectivity = useConnectivity();
  const offline =
    connectivity.isConnected === false || connectivity.isInternetReachable === false;

  async function goOnline() {
    if (busyId || goingOnline) return;
    setGoingOnline(true);
    setActionError(null);
    try {
      const { error: rpcError } = await supabase.rpc("rider_set_status", {
        p_status: "online",
      });
      if (rpcError) {
        setActionError(rpcError.message);
        return;
      }
      // The status is the rider's own row, so the profile behind the status is
      // stale, and an offer arriving after this should clear the banner.
      await Promise.all([refetch(), refetchProfile()]);
    } finally {
      setGoingOnline(false);
    }
  }

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

  // The profile's own query state, not a sibling's. This used to read the
  // OFFERS query's isPending and then gate on `!profile`, so the moment offers
  // resolved the screen checked a profile that was still in flight -- undefined
  // is falsy -- and rendered the "no rider profile, sign out" dead end for
  // riders who had one.
  const gate = riderProfileGate(profileQuery);

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
        <Pressable
          style={styles.linkButton}
          onPress={() => void profileQuery.refetch()}
        >
          <Text style={styles.linkLabel}>Try again</Text>
        </Pressable>
        <StatusBar style="dark" />
      </View>
    );
  }

  // The only genuine dead end: the query resolved and there is no rider row.
  if (gate.kind === "missing") {
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

  const profile = gate.profile as RiderProfile;

  return (
    <View style={styles.container}>
      <FlatList
        data={offers ?? []}
        keyExtractor={(o) => String(o.offerId)}
        contentContainerStyle={[styles.list, { paddingBottom: bottomPadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={
          <View>
            <View
              style={[styles.sectionHeader, { paddingTop: spacing.lg + insets.top }]}
            >
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
            {profile.status !== "online" ? (
              <OfflineBanner status={profile.status} onGoOnline={goOnline} />
            ) : null}
            {/* Accepting and declining both need a round trip; while offline the
                buttons are disabled, so the screen says why. */}
            {offline ? (
              <View style={styles.offlineBanner} accessibilityRole="alert">
                <Text style={styles.offlineText}>
                  You&apos;re offline. Accepting or declining an offer needs a
                  connection.
                </Text>
              </View>
            ) : null}
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
                Turn on your availability on the Profile tab and offers will appear here
                to accept. Offers are only sent to riders who are online.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const expired = secondsUntilExpiry(item.expiresAt, now) <= 0;
          const claimable = isOfferClaimable(item, now);
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
                {deviceMapsUrl(item.deliveryAddress) ? (
                  <Pressable
                    style={styles.navigateRow}
                    accessibilityRole="link"
                    accessibilityLabel={`Navigate to ${item.deliveryAddress}`}
                    onPress={() => void openInMaps(item.deliveryAddress)}
                  >
                    <Text style={styles.navigateLabel}>Navigate to drop-off</Text>
                    <Text style={styles.navigateHint}>Opens maps</Text>
                  </Pressable>
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
                  style={[
                    styles.declineButton,
                    (busy || expired || offline) && styles.disabled,
                  ]}
                  disabled={busy || expired || offline}
                  accessibilityRole="button"
                  accessibilityLabel={`Decline ${item.reference}`}
                  onPress={() => void onDecline(item)}
                >
                  <Text style={styles.declineLabel}>Decline</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.acceptButton,
                    (!claimable || busy || offline) && styles.disabled,
                  ]}
                  disabled={!claimable || busy || offline}
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

/**
 * Why the queue is empty when it looks like it should not be.
 *
 * Dispatch only inserts offers for riders whose status is `online`
 * (admin_dispatch_order filters `d.status = 'online'`), so an offline or busy
 * rider gets nothing and the empty state has to explain that -- otherwise the
 * screen reads as broken. One tap back to online, because the alternative is a
 * trip to the Profile tab to find one control.
 */
function OfflineBanner({
  status,
  onGoOnline,
}: {
  status: string;
  onGoOnline: () => Promise<void>;
}) {
  const meta = riderStatusMeta(status);
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <View style={styles.bannerText}>
        <Text style={styles.bannerTitle}>
          {status === "busy" ? "You're on a delivery" : "You're offline"}
        </Text>
        <Text style={styles.bannerBody}>{meta.description}.</Text>
      </View>
      <Pressable
        style={styles.bannerButton}
        onPress={() => void onGoOnline()}
        accessibilityRole="button"
        accessibilityLabel="Go online"
        accessibilityHint="Sets your availability to online so offers reach you"
      >
        <Text style={styles.bannerButtonLabel}>Go online</Text>
      </Pressable>
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
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  bannerText: { flex: 1, gap: 2 },
  bannerTitle: { ...type.body, fontWeight: "700", color: colors.warning },
  bannerBody: { ...type.caption, color: colors.textMuted },
  bannerButton: {
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  bannerButtonLabel: { ...type.label, color: colors.textInverse },
  offlineBanner: {
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  offlineText: { ...type.caption, color: colors.warning, fontWeight: "600" },
  navigateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  navigateLabel: { ...type.body, color: colors.primary, fontWeight: "700" },
  navigateHint: { ...type.caption, color: colors.textFaint },
});
