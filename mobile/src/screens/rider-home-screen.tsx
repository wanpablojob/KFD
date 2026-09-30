import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
  const [loading, setLoading] = useState(true);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Page 1: initial load
  const { data: page1, refetch: refetchPage1 } = useRiderOrders(null, 20);
  const { data: profile } = useRiderProfile(userId);

  // Reset pagination whenever page 1 resolves to a new result. Adjusting state
  // during render (rather than in an effect) is React's documented pattern for
  // deriving from a changing value and avoids the set-state-in-effect cascade.
  const [syncedPage1, setSyncedPage1] = useState(page1);
  if (page1 !== syncedPage1) {
    setSyncedPage1(page1);
    const data = page1 as RiderOrderPageResult | undefined;
    setOrders(data?.items ?? []);
    setNextCursor(data?.nextCursor ?? null);
    setHasMore(!!data?.nextCursor);
    if (data) setLoading(false);
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
    // Refresh page 1 to get updated status/delivery count
    await refetchPage1();
  }

  if (loading) {
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
          <Text style={styles.empty}>No deliveries assigned yet.</Text>
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
              <Text style={styles.orderCustomer}>Customer: {item.customer}</Text>
              <Text style={styles.orderTotal}>
                ₱{Number(item.total).toFixed(2)} · {item.payment} ·{" "}
                {new Date(item.placed_at).toLocaleString()}
              </Text>
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
  orderCustomer: { ...type.caption, color: colors.textFaint },
  orderTotal: { ...type.caption, color: colors.textFaint },
  deliverButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  deliverButtonLabel: { ...type.label, color: colors.textInverse },
});
