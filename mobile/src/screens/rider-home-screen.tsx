import { useCallback, useState } from "react";
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
import { supabase } from "../lib/supabase";
import { signOut } from "../lib/auth";
import { notifyRiderDelivered } from "../lib/push";
import {
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
  const [orders, setOrders] = useState<AssignedOrder[]>([]);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Page 1: initial load
  const {
    data: page1,
    error: page1Error,
    refetch: refetchPage1,
    isPending,
  } = useRiderOrders(null, 20);
  const { data: profile } = useRiderProfile(userId);

  // Reset pagination whenever page 1 resolves to a new result. Adjusting state
  // during render (rather than in an effect) is React's documented pattern for
  // deriving from a changing value and avoids the set-state-in-effect cascade.
  //
  // The spinner used to be mirrored into local state here, gated on `if (data)`.
  // That never cleared when the query failed: `placeholderData` keeps `data`
  // undefined across pending -> error, so this block never re-ran and the
  // screen spun forever with no message. The query's own isPending is the
  // honest signal -- it is false once the query settles either way.
  const [syncedPage1, setSyncedPage1] = useState(page1);
  if (page1 !== syncedPage1) {
    setSyncedPage1(page1);
    const data = page1 as RiderOrderPageResult | undefined;
    setOrders(data?.items ?? []);
    setNextCursor(data?.nextCursor ?? null);
    setHasMore(!!data?.nextCursor);
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
      const { data } = await supabase.rpc("fetch_rider_orders_page", {
        p_cursor: nextCursor,
        p_limit: 20,
      });
      const rows = (data ?? []) as (RiderOrderPageResult["items"][0] & {
        next_cursor: string | null;
      })[];
      const next = rows[0]?.next_cursor ?? null;
      setOrders((prev) => [...prev, ...rows]);
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
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={[styles.sectionHeader, { paddingTop: spacing.lg + insets.top }]}>
            <Text style={styles.sectionTitle}>Your deliveries</Text>
            {loadingMore && <ActivityIndicator size="small" color={colors.secondary} />}
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
          const canDeliver = !["delivered", "cancelled"].includes(item.status);
          return (
            <View style={styles.orderCard}>
              <View style={styles.orderHeader}>
                <Text style={styles.orderRef}>{item.reference}</Text>
                <Text style={styles.orderStatus}>
                  {STATUS_LABEL[item.status] ?? item.status}
                </Text>
              </View>

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
                  changes later. */}
              <View style={styles.footer}>
                <Text style={styles.payout}>
                  {item.rider_payout !== null
                    ? `You earn ₱${Number(item.rider_payout).toFixed(2)}`
                    : "Payout pending"}
                </Text>
                <Text style={styles.placedAt}>
                  {item.payment} · {new Date(item.placed_at).toLocaleString()}
                </Text>
              </View>

              {canDeliver ? (
                <Pressable
                  style={[
                    styles.deliverButton,
                    deliveringId === item.id && styles.disabled,
                  ]}
                  disabled={deliveringId !== null}
                  onPress={() => void markDelivered(item.id)}
                >
                  {deliveringId === item.id ? (
                    <ActivityIndicator color={colors.textInverse} size="small" />
                  ) : (
                    <Text style={styles.deliverButtonLabel}>Mark delivered</Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          );
        }}
        ListFooterComponent={
          fetchError ? <Text style={styles.error}>{fetchError}</Text> : null
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
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  payout: { ...type.body, color: colors.text, fontWeight: "700" },
  placedAt: { ...type.caption, color: colors.textFaint },
  deliverButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  deliverButtonLabel: { ...type.label, color: colors.textInverse },
});
