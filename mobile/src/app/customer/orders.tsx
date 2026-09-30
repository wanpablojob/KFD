import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMyOrders, type CustomerOrder } from "../../lib/hooks";
import { useSession } from "../../lib/session-context";
import { supabase } from "../../lib/supabase";
import { colors, radius, shadow, spacing, type } from "../../lib/theme";

const STATUS_LABEL: Record<string, string> = {
  pending: "Order placed",
  confirmed: "Confirmed",
  preparing: "Being prepared",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default function CustomerOrdersScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { data: orders, isLoading, isError, error, refetch } = useMyOrders();
  const [mounted, setMounted] = useState(false);

  // Realtime subscription for live order status updates
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useFocusEffect(
    useCallback(() => {
      setMounted(true);
      if (!user) return;
      const channel = supabase
        .channel("customer-orders")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
            filter: `customer_user_id=eq.${user.id}`,
          },
          () => {
            refetch();
          }
        )
        .subscribe();
      channelRef.current = channel;
      return () => {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      };
    }, [refetch, user])
  );

  if (!mounted) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={type.caption}>LOADING ORDERS…</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={type.caption}>LOADING ORDERS…</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.errorTitle}>!</Text>
        <Text style={styles.error}>
          {error instanceof Error ? error.message : "Could not load your orders."}
        </Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryLabel}>RETRY</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={orders}
        keyExtractor={(row) => row.reference}
        contentContainerStyle={[styles.list, { paddingTop: spacing.lg + insets.top }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={type.display}>Your orders</Text>
            <Text style={type.caption}>Tap an order to track it</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={type.body}>Your first order will show up here.</Text>
          </View>
        }
        renderItem={({ item }) => <OrderCard order={item} />}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => refetch()} />
        }
      />
    </View>
  );
}

function OrderCard({ order }: { order: CustomerOrder }) {
  const router = useRouter();
  const cancelled = order.status === "cancelled";
  const delivered = order.status === "delivered";

  return (
    <Pressable
      style={({ pressed }) => [styles.card, shadow.card, pressed && styles.cardPressed]}
      onPress={() =>
        router.push({
          pathname: "/track",
          params: { ref: order.reference },
        })
      }
    >
      <View style={styles.cardHead}>
        <View style={styles.cardHeadText}>
          <Text style={styles.ref}>{order.reference}</Text>
          <Text style={type.body}>{order.restaurant}</Text>
        </View>
        <View
          style={[
            styles.status,
            cancelled && styles.statusCancelled,
            delivered && styles.statusDelivered,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              cancelled && styles.statusTextCancelled,
              delivered && styles.statusTextDelivered,
            ]}
          >
            {STATUS_LABEL[order.status] ?? order.status}
          </Text>
        </View>
      </View>

      <Text style={styles.items}>
        {order.items.map((i) => `${i.quantity}× ${i.name}`).join(" · ")}
      </Text>

      <View style={styles.cardFoot}>
        <Text style={type.caption}>
          {new Date(order.placed_at).toLocaleDateString()}
        </Text>
        <Text style={type.price}>₱{Number(order.total).toFixed(2)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: "center", justifyContent: "center", gap: spacing.md },
  header: { gap: 2, paddingBottom: spacing.sm },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardPressed: { backgroundColor: colors.surface },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  cardHeadText: { flex: 1, gap: 2 },
  ref: { ...type.heading, color: colors.primary },
  status: {
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  statusCancelled: { backgroundColor: colors.dangerSoft },
  statusDelivered: { backgroundColor: colors.successSoft },
  statusText: { fontSize: 11, fontWeight: "800", color: colors.warning },
  statusTextCancelled: { color: colors.danger },
  statusTextDelivered: { color: colors.success },
  items: { ...type.caption, color: colors.textMuted },
  cardFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  empty: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xxl },
  emptyTitle: { ...type.title, color: colors.textMuted },
  errorTitle: { fontSize: 22, fontWeight: "800", color: colors.danger },
  error: { ...type.body, color: colors.danger, textAlign: "center" },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  retryLabel: { ...type.label, color: colors.textInverse },
});
