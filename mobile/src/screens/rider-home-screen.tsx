import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScrollBottomPadding } from "../components/TabBarInset";
import { supabase } from "../lib/supabase";
import { signOut } from "../lib/auth";
import { notifyRiderDelivered } from "../lib/push";
import { mergeOrderPages, shouldSyncPage1 } from "../lib/delivery-sync";
import { riderProfileGate } from "../lib/rider-profile-gate";
import { deviceMapsUrl, openInMaps } from "../lib/maps";
import { isTerminalStatus } from "../lib/order-progress";
import { deliveryActions } from "../lib/delivery-actions";
import { isCashPayment, paymentLabel } from "../lib/payment-label";
import { footerMeta } from "../lib/order-timestamp";
import { useConnectivity } from "../lib/connectivity-context";
import {
  useMarkPickedUp,
  useRiderOrders,
  useRiderProfile,
  type RiderOrderPageResult,
} from "../lib/hooks";
import { colors, radius, spacing, type } from "../lib/theme";

type AssignedOrder = RiderOrderPageResult["items"][0];

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/**
 * Rider deliveries tab. Reads the orders assigned to the calling rider by name
 * (0018's "riders read assigned orders" policy).
 *
 * Orders are loaded via cursor-based pagination (fetch_rider_orders_page RPC).
 * Pull-to-refresh reloads page 1; onEndReached loads the next page.
 *
 * Availability and sign-out live on the profile tab; the rider's own stats are
 * on the earnings tab, so this screen stays about the delivery queue.
 */
export function RiderHomeScreen({ userId }: { userId: string }) {
  const insets = useSafeAreaInsets();
  const bottomPadding = useScrollBottomPadding();
  const [orders, setOrders] = useState<AssignedOrder[]>([]);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const [pickingUpId, setPickingUpId] = useState<string | null>(null);
  const pickedUp = useMarkPickedUp();
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Failed-delivery report (migration 0044). The reason is rider input, so it
  // needs a field rather than a confirm dialog -- Alert.prompt is iOS-only and
  // Android is where most of these riders are.
  const [failingId, setFailingId] = useState<string | null>(null);
  const [failReason, setFailReason] = useState("");
  const [reporting, setReporting] = useState(false);

  // Marking delivered writes a payout and cannot be undone, and it sits beside
  // the escape hatch. It gets a confirmation sheet showing the amount being
  // settled, so neither button is a single irreversible tap.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const connectivity = useConnectivity();
  const offline =
    connectivity.isConnected === false || connectivity.isInternetReachable === false;

  // Page 1: initial load
  const {
    data: page1,
    error: page1Error,
    refetch: refetchPage1,
    isPending,
  } = useRiderOrders(null, 20);
  const profileQuery = useRiderProfile(userId);

  // Reset pagination whenever page 1 resolves to a new result. Adjusting state
  // during render (rather than in an effect) is React's documented pattern for
  // deriving from a changing value and avoids the set-state-in-effect cascade.
  //
  // The spinner used to be mirrored into local state here, gated on `if (data)`.
  // That never cleared when the query failed: `placeholderData` keeps `data`
  // undefined across pending -> error, so this block never re-ran and the
  // screen spun forever with no message. The query's own isPending is the
  // honest signal -- it is false once the query settles either way.
  // Only ever sync from a *defined* page1.
  //
  // This used to sync on any identity change, including page1 becoming
  // undefined. That is what emptied the list on tab change: the rider Stack
  // unmounts an inactive screen, so coming back remounts this component, the
  // query goes pending, and data is undefined until it resolves. The old code
  // read that undefined as "the server returned zero orders" and called
  // setOrders([]) -- so a rider who tapped Earnings and came back watched
  // their deliveries vanish and had to pull to refresh to get them back.
  //
  // placeholderData keeps the last good data through a background refetch, but
  // it cannot help across an unmount: there is no previous observer to inherit
  // from. Gating on `page1` being defined means an in-flight or failed refetch
  // leaves the current list untouched, which is the honest reading -- we do not
  // yet know what the server says, so we do not throw away what we had.
  // Seeded from undefined, NOT from page1. This is the fix for the list
  // vanishing on every tab return.
  //
  // `useState(page1)` looked harmless and was the cause: on a remount with warm
  // cache -- staleTime is 5 minutes and the cache is persisted to disk, so a tab
  // return usually lands on fresh data -- page1 is already defined on the FIRST
  // render. Seeding the marker from it made syncedPage1 equal the data, so
  // shouldSyncPage1 reported "nothing changed", setOrders was never called, and
  // the tab stayed empty with no spinner and no error. Cold starts happened to
  // recover, because page1 began undefined and the first real result differed
  // from it -- which is exactly why the guard added to stop the vanishing
  // appeared to work in testing and failed in the app.
  //
  // undefined is the honest seed: nothing has been synced yet, so the first
  // defined page1 is by definition new and must be applied.
  const [syncedPage1, setSyncedPage1] = useState<RiderOrderPageResult | undefined>(
    undefined
  );
  if (shouldSyncPage1(page1, syncedPage1)) {
    setSyncedPage1(page1);
    const data = page1 as RiderOrderPageResult;
    setOrders(data.items);
    setNextCursor(data.nextCursor);
    setHasMore(!!data.nextCursor);
  }

  // Pull-to-refresh: reload page 1
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetchPage1();
    } catch (cause) {
      setFetchError(cause instanceof Error ? cause.message : "Failed to load data.");
    } finally {
      setRefreshing(false);
    }
  }, [refetchPage1]);

  // Load next page
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !nextCursor) return;
    setLoadingMore(true);
    try {
      const { data, error } = await supabase.rpc("fetch_rider_orders_page", {
        p_cursor: nextCursor,
        p_limit: 20,
      });
      // The error was ignored here. A failed page left `next` null, so hasMore
      // went false and the failure read as "no more orders" -- the rider saw the
      // list simply stop, with no way to retry and no hint that anything went
      // wrong. Surface it and leave hasMore alone so the same cursor is tried
      // again on the next scroll.
      if (error) {
        setFetchError(error.message);
        return;
      }
      const rows = (data ?? []) as (RiderOrderPageResult["items"][0] & {
        next_cursor: string | null;
      })[];
      const next = rows[0]?.next_cursor ?? null;
      // mergeOrderPages, not [...prev, ...rows]: an order that changed status
      // between the page-1 fetch and this one can appear in both, and appending
      // it twice gives two rows with the same key.
      setOrders((prev) => mergeOrderPages(prev, rows));
      setNextCursor(next);
      setHasMore(!!next);
    } catch (cause) {
      setFetchError(
        cause instanceof Error ? cause.message : "Failed to load more orders."
      );
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor, loadingMore]);

  // Handle FlatList onEndReached
  const handleEndReached = useCallback(() => {
    if (!loadingMore) loadMore();
  }, [loadMore, loadingMore]);

  async function onPickedUp(orderId: string) {
    if (pickingUpId || deliveringId) return;
    setPickingUpId(orderId);
    setFetchError(null);
    try {
      await pickedUp.mutateAsync(orderId);
    } catch (cause) {
      setFetchError(
        cause instanceof Error ? cause.message : "Could not update the order."
      );
    } finally {
      setPickingUpId(null);
    }
  }

  async function markDelivered(orderId: string) {
    if (deliveringId) return;
    setDeliveringId(orderId);
    setFetchError(null);
    const { error } = await supabase.rpc("rider_mark_delivered", {
      p_order_id: orderId,
    });
    setDeliveringId(null);
    if (error) {
      setFetchError(error.message);
      return;
    }
    // The delivery is recorded; the alert is a courtesy on top of it, so it
    // runs after the successful write and its own failure is swallowed.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      void notifyRiderDelivered(session.access_token, orderId);
    }
    // Refresh page 1 to get updated status/delivery count
    await refetchPage1();
  }

  function openFailReport(orderId: string) {
    setFetchError(null);
    setFailReason("");
    setFailingId(orderId);
  }

  function closeFailReport() {
    setFailingId(null);
    setFailReason("");
  }

  /**
   * Returns the order to the dispatch pool. Unlike markDelivered this earns
   * nothing and sends no push: nothing was delivered, so there is no completed
   * job to celebrate and no ledger row was written.
   */
  async function reportFailed(orderId: string) {
    const reason = failReason.trim();
    // The server rejects this too (22023), but saying it here saves a round
    // trip and keeps the field's error message next to the field.
    if (!reason || reporting) return;
    setReporting(true);
    setFetchError(null);
    const { error } = await supabase.rpc("rider_report_failed_delivery", {
      p_order_id: orderId,
      p_reason: reason,
    });
    setReporting(false);
    if (error) {
      setFetchError(error.message);
      return;
    }
    closeFailReport();
    // The order left this rider's list, so page 1 has to be re-read.
    await refetchPage1();
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

  // Three-way state, not two. `profile === null` was wrong in the other
  // direction from Available: undefined (still resolving) is not null, so it fell
  // through to the list while the profile was unknown. Both screens were wrong
  // from the same conflation, in opposite directions -- which is why this read as
  // two unrelated bugs. See lib/rider-profile-gate.ts.
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

  // Active pinned at the top, history below, both derived from the one list the
  // cursor pages into. Not a second query: a delivered order is still on this
  // list until the next page-1 refetch, and two sources would disagree about
  // which section it belongs in.
  const active = orders.filter((o) => !isTerminalStatus(o.status));
  const past = orders.filter((o) => isTerminalStatus(o.status));
  const sections = [
    ...(active.length > 0 ? [{ title: "Active", data: active }] : []),
    ...(past.length > 0 ? [{ title: "Past", data: past }] : []),
  ];

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(o) => o.id}
        contentContainerStyle={[styles.list, { paddingBottom: bottomPadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={styles.groupLabel}>{section.title}</Text>
        )}
        ListHeaderComponent={
          <View>
            <View
              style={[styles.sectionHeader, { paddingTop: spacing.lg + insets.top }]}
            >
              <Text style={styles.sectionTitle}>Your deliveries</Text>
              {loadingMore && (
                <ActivityIndicator size="small" color={colors.secondary} />
              )}
            </View>
            {/* The write buttons below are disabled while offline, so the screen
                has to say why -- an inert button with no reason reads as a bug. */}
            {offline ? (
              <View style={styles.offlineBanner} accessibilityRole="alert">
                <Text style={styles.offlineText}>
                  You&apos;re offline. Marking a delivery or reporting a problem needs a
                  connection.
                </Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          // Page 1 failing is the case that used to be invisible. Show why,
          // rather than an empty list that reads like "no work assigned".
          page1Error ? (
            <Text style={styles.error}>{page1Error.message}</Text>
          ) : (
            <Text style={styles.empty}>No deliveries assigned yet.</Text>
          )
        }
        renderItem={({ item }) => {
          // One shared contract with the server's guards (lib/delivery-actions).
          // This used to be `!isTerminalStatus(...)` -- "not finished" rather
          // than "can act on" -- which offered Mark delivered on a `pending`
          // order the server refuses, a button that could only ever error.
          const { canPickUp, canDeliver } = deliveryActions(item.status);
          const cash = item.payment === "cash";
          const busy = deliveringId !== null || reporting;
          return (
            <View style={[styles.orderCard, !canDeliver && styles.orderCardPast]}>
              <View style={styles.orderHeader}>
                <Text style={styles.orderRef}>{item.reference}</Text>
                <Text style={styles.orderStatus}>
                  {STATUS_LABEL[item.status] ?? item.status}
                </Text>
              </View>

              {/* What the rider has to collect, only while there is still a
                  delivery to make. Cash is the customer's money, not the
                  rider's, so it is stated separately from the fee below and
                  never added to it. */}
              {canDeliver && cash ? (
                <View style={styles.collect}>
                  <Text style={styles.collectLabel}>Collect from customer</Text>
                  <Text style={styles.collectAmount}>
                    ₱{Number(item.total).toFixed(2)}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.orderRestaurant}>{item.restaurant}</Text>

              {/* Where to go. Absent only for orders placed before addresses
                  existed, so it is stated rather than left blank. */}
              <View style={styles.block}>
                <Text style={styles.blockLabel}>Deliver to</Text>
                <Text style={styles.blockValue}>
                  {item.customer}
                  {item.delivery_address ? `\n${item.delivery_address}` : ""}
                </Text>
              </View>

              {/* Opens the phone's maps app with the address. No maps SDK and no
                  location permission: a geo: URL hands the address to whatever
                  the rider already uses. Hidden when there is no address to
                  navigate to, rather than shown as a dead button. */}
              {canDeliver && deviceMapsUrl(item.delivery_address) ? (
                <Pressable
                  style={styles.navigateRow}
                  accessibilityRole="link"
                  accessibilityLabel={`Navigate to ${item.delivery_address}`}
                  onPress={() => void openInMaps(item.delivery_address)}
                >
                  <Text style={styles.navigateLabel}>Navigate</Text>
                  <Text style={styles.navigateHint}>Opens maps</Text>
                </Pressable>
              ) : null}

              {/* How to reach them. No number on file is a real state, not an
                  error, so it says so instead of rendering a dead tel: link. */}
              {item.customer_phone ? (
                <Pressable
                  style={styles.callRow}
                  accessibilityRole="link"
                  accessibilityLabel={`Call ${item.customer}`}
                  onPress={() =>
                    void Linking.openURL(`tel:${item.customer_phone ?? ""}`).catch(
                      () => undefined
                    )
                  }
                >
                  <Text style={styles.callLabel}>Call customer</Text>
                  <Text style={styles.callNumber}>{item.customer_phone}</Text>
                </Pressable>
              ) : (
                <View style={styles.callRow}>
                  <Text style={styles.noPhone}>No contact number on file</Text>
                </View>
              )}

              {/* What they are picking up. */}
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

              {/* The rider's own fee, not the customer's bill. Frozen onto the
                  order when it was claimed, so it cannot drift if the rate
                  changes later.

                  The footer is a column, not a row. It used to be
                  justifyContent: "space-between" with the payout on the left and
                  "Cash on Delivery · 9/24/2026, 10:50:00 AM" on the right,
                  which needed ~398pt in a 335pt card on an iPhone SE -- the
                  date ran off the edge of the screen. See lib/order-timestamp.ts
                  for why the format is fixed rather than toLocaleString(). */}
              <View style={styles.footer}>
                <Text style={styles.payout}>
                  {item.rider_payout !== null
                    ? `You earn ₱${Number(item.rider_payout).toFixed(2)}`
                    : "Payout pending"}
                </Text>
                <Text style={styles.placedAt} numberOfLines={1}>
                  {footerMeta(paymentLabel(item.payment), item.placed_at)}
                </Text>
              </View>

              {/* Picking the food up is a separate fact from delivering it, and
                  it was previously unstateable: the enum had out_for_delivery,
                  every read path understood it, and nothing could set it. So the
                  card could not distinguish "waiting at the restaurant" from "on
                  the way", and the customer's tracker could never leave
                  "Being prepared". Hidden once the food is already collected,
                  because then it is noise. */}
              {canPickUp ? (
                <Pressable
                  style={[
                    styles.pickupButton,
                    (pickingUpId === item.id || busy || offline) && styles.disabled,
                  ]}
                  disabled={busy || offline}
                  accessibilityRole="button"
                  accessibilityLabel={`Confirm you have collected ${item.reference}`}
                  onPress={() => onPickedUp(item.id)}
                >
                  {pickingUpId === item.id ? (
                    <ActivityIndicator color={colors.textInverse} size="small" />
                  ) : (
                    <Text style={styles.pickupLabel}>Picked up</Text>
                  )}
                </Pressable>
              ) : null}

              {canDeliver ? (
                // Two outcomes, side by side. Reporting a failure is the honest
                // escape from a job that cannot be completed, and it has to be
                // as reachable as the lie it replaces.
                <View style={styles.actions}>
                  <Pressable
                    style={[styles.failButton, (busy || offline) && styles.disabled]}
                    disabled={busy || offline}
                    accessibilityRole="button"
                    accessibilityLabel={`Report ${item.reference} as not deliverable`}
                    onPress={() => openFailReport(item.id)}
                  >
                    <Text style={styles.failButtonLabel}>Can&apos;t deliver</Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.deliverButton,
                      (deliveringId === item.id || busy) && styles.disabled,
                    ]}
                    disabled={busy || offline}
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${item.reference} delivered`}
                    onPress={() => setConfirmingId(item.id)}
                  >
                    {deliveringId === item.id ? (
                      <ActivityIndicator color={colors.textInverse} size="small" />
                    ) : (
                      <Text style={styles.deliverButtonLabel}>Mark delivered</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        }}
        ListFooterComponent={
          fetchError ? <Text style={styles.error}>{fetchError}</Text> : null
        }
      />

      {/* Confirmation for the one irreversible action on this screen: it writes
          the payout ledger row and cannot be undone. Shown as a sheet rather than
          Alert.prompt because Alert is iOS-only and Android is where most riders
          are. */}
      <Modal
        visible={confirmingId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmingId(null)}
      >
        <Pressable
          style={styles.backdrop}
          accessibilityLabel="Dismiss"
          onPress={() => setConfirmingId(null)}
        >
          <Pressable
            style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]}
            onPress={() => undefined}
          >
            <Text style={styles.sheetTitle}>Mark this delivery as complete?</Text>
            {(() => {
              const order = orders.find((o) => o.id === confirmingId);
              if (!order) return null;
              const cash = isCashPayment(order.payment);
              return (
                <>
                  <Text style={styles.sheetBody}>
                    {order.reference} · {order.restaurant}. This records your fee and
                    cannot be undone.
                  </Text>
                  {cash ? (
                    <View style={styles.collect}>
                      <Text style={styles.collectLabel}>
                        Collect from {order.customer}
                      </Text>
                      <Text style={styles.collectAmount}>
                        ₱{Number(order.total).toFixed(2)}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.sheetBody}>
                      Payment method: {paymentLabel(order.payment)}. Nothing to collect.
                    </Text>
                  )}
                </>
              );
            })()}
            <View style={styles.sheetActions}>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => setConfirmingId(null)}
              >
                <Text style={styles.secondaryButtonLabel}>Not yet</Text>
              </Pressable>
              <Pressable
                style={[styles.deliverButton, styles.sheetPrimary]}
                onPress={() => {
                  const id = confirmingId;
                  setConfirmingId(null);
                  if (id) void markDelivered(id);
                }}
              >
                <Text style={styles.deliverButtonLabel}>Yes, delivered</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={failingId !== null}
        transparent
        animationType="fade"
        onRequestClose={closeFailReport}
      >
        <Pressable
          style={styles.backdrop}
          accessibilityLabel="Dismiss"
          onPress={closeFailReport}
        >
          {/* Stops a tap inside the sheet from dismissing it. */}
          <Pressable
            style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]}
            onPress={() => undefined}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
              <Text style={styles.sheetTitle}>Why can&apos;t you deliver this?</Text>
              <Text style={styles.sheetBody}>
                The order goes back to the restaurant to hand to another rider. You earn
                nothing for it, and the reason is recorded against your name.
              </Text>

              <TextInput
                style={styles.input}
                value={failReason}
                onChangeText={setFailReason}
                placeholder="Customer not answering, address not found, order already cancelled…"
                placeholderTextColor={colors.textFaint}
                multiline
                numberOfLines={3}
                maxLength={500}
                autoFocus
                editable={!reporting}
                accessibilityLabel="Reason the delivery could not be completed"
              />
              <Text style={styles.counter}>{failReason.trim().length}/500</Text>

              <View style={styles.sheetActions}>
                <Pressable
                  style={[styles.secondaryButton, reporting && styles.disabled]}
                  disabled={reporting}
                  onPress={closeFailReport}
                >
                  <Text style={styles.secondaryButtonLabel}>Keep the order</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.failButton,
                    (!failReason.trim() || reporting) && styles.disabled,
                  ]}
                  disabled={!failReason.trim() || reporting}
                  onPress={() => failingId && void reportFailed(failingId)}
                >
                  {reporting ? (
                    <ActivityIndicator color={colors.textInverse} size="small" />
                  ) : (
                    <Text style={styles.failButtonLabel}>Return to restaurant</Text>
                  )}
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      </Modal>

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
  disabled: { opacity: 0.6 },
  error: { ...type.body, color: colors.danger },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...type.heading, fontSize: 17 },
  empty: {
    ...type.caption,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.xxl,
  },
  orderCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  orderCardPast: { opacity: 0.7 },
  groupLabel: {
    ...type.eyebrow,
    color: colors.secondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  collect: {
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  collectLabel: {
    ...type.caption,
    color: colors.warning,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  collectAmount: { ...type.display, fontSize: 26, color: colors.text },
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
  offlineBanner: {
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  offlineText: { ...type.caption, color: colors.warning, fontWeight: "600" },
  sheetPrimary: { flex: 1, marginTop: 0 },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderRef: { ...type.heading, color: colors.primary },
  orderStatus: { ...type.label, color: colors.secondary },
  orderRestaurant: { ...type.body, color: colors.textMuted },
  block: { gap: 2, marginTop: spacing.sm },
  blockLabel: {
    ...type.caption,
    color: colors.textFaint,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  blockValue: { ...type.body, color: colors.text },
  callRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  callLabel: { ...type.body, color: colors.primary, fontWeight: "700" },
  callNumber: { ...type.caption, color: colors.textMuted },
  noPhone: { ...type.caption, color: colors.textFaint },
  // Column, not a row. Both children are full width and the second can shrink
  // and ellipsize, so the card's own width is the only thing that constrains
  // them. Nothing here can push content past the screen edge.
  footer: {
    marginTop: spacing.md,
    gap: 2,
  },
  payout: { ...type.body, color: colors.text, fontWeight: "700" },
  placedAt: {
    ...type.caption,
    color: colors.textFaint,
    // The two that make overflow structurally impossible rather than merely
    // unlikely: the text yields width instead of demanding it, and it truncates
    // with an ellipsis if a future format is longer than today's.
    flexShrink: 1,
    width: "100%",
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  pickupButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.secondary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  pickupLabel: { ...type.label, color: colors.textInverse, fontWeight: "700" },
  deliverButton: {
    flex: 1,
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  deliverButtonLabel: { ...type.label, color: colors.textInverse },

  // Outlined, not filled: returning an order is the exceptional path and must
  // not read as the primary action next to "Mark delivered".
  failButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    backgroundColor: colors.card,
  },
  failButtonLabel: { ...type.label, color: colors.danger },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sheetTitle: { ...type.title, fontSize: 18 },
  sheetBody: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  input: {
    ...type.body,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 88,
    marginTop: spacing.sm,
    textAlignVertical: "top",
  },
  counter: { ...type.caption, color: colors.textFaint, alignSelf: "flex-end" },
  sheetActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  secondaryButtonLabel: { ...type.label, color: colors.textMuted },
});
