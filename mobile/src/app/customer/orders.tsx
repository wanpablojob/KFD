import { useCallback, useRef, useState, useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScrollBottomPadding } from "../../components/TabBarInset";
import {
  useMyDeliveries,
  useMyOrders,
  useCancelOrder,
  useMyRatings,
  useRateOrder,
  type CustomerDelivery,
  type CustomerOrder,
  useMyRefunds,
} from "../../lib/hooks";
import { useSession } from "../../lib/session-context";
import { useCart } from "../../lib/cart-context";
import { fetchMenu } from "../../lib/storefront";
import { buildReorder } from "../../lib/reorder";
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

/**
 * The actions on one order: reorder it, cancel it, rate it.
 *
 * Shared by the single-order card and by a trip's card, where each shop's
 * part carries its own actions: a rating and a cancellation are about a shop,
 * even though the delivery as a whole is the customer's.
 */
function OrderActions({
  order,
  refunded,
  rating,
  onReorder,
  reordering,
  onCancel,
  cancelling,
  onRate,
}: {
  order: CustomerOrder;
  refunded: number;
  rating: { restaurant_rating: number; rider_rating: number | null } | undefined;
  onReorder: (order: CustomerOrder) => void;
  reordering: boolean;
  onCancel: (order: CustomerOrder) => void;
  cancelling: boolean;
  onRate: (order: CustomerOrder) => void;
}) {
  const cancelled = order.status === "cancelled";
  const delivered = order.status === "delivered";
  const canReorder = delivered || cancelled;
  // Once the restaurant accepts, it may be cooking: cancel_order refuses (0076).
  const canCancel = order.status === "pending";

  return (
    <>
      {canReorder ? (
        <Pressable
          style={({ pressed }) => [
            styles.reorderBtn,
            reordering && styles.reorderDisabled,
            pressed && !reordering && styles.reorderPressed,
          ]}
          onPress={() => onReorder(order)}
          disabled={reordering}
          accessibilityRole="button"
          accessibilityLabel={`Reorder ${order.reference}`}
        >
          {reordering ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text style={styles.reorderLabel}>Reorder</Text>
          )}
        </Pressable>
      ) : null}

      {canCancel ? (
        <Pressable
          style={({ pressed }) => [
            styles.cancelBtn,
            cancelling && styles.reorderDisabled,
            pressed && !cancelling && styles.cancelPressed,
          ]}
          onPress={() => onCancel(order)}
          disabled={cancelling}
          accessibilityRole="button"
          accessibilityLabel={`Cancel ${order.reference}`}
        >
          {cancelling ? (
            <ActivityIndicator color={colors.danger} size="small" />
          ) : (
            <Text style={styles.cancelLabel}>Cancel order</Text>
          )}
        </Pressable>
      ) : null}

      {delivered ? (
        rating ? (
          <View style={styles.ratedRow}>
            <Text style={styles.ratedText}>
              You rated ★ {rating.restaurant_rating}
              {rating.rider_rating ? ` · rider ★ ${rating.rider_rating}` : ""}
            </Text>
            <Pressable
              onPress={() => onRate(order)}
              accessibilityRole="button"
              accessibilityLabel={`Edit rating for ${order.reference}`}
            >
              <Text style={styles.ratedEdit}>Edit</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.rateBtn, pressed && styles.reorderPressed]}
            onPress={() => onRate(order)}
            accessibilityRole="button"
            accessibilityLabel={`Rate ${order.reference}`}
          >
            <Text style={styles.rateLabel}>Rate order</Text>
          </Pressable>
        )
      ) : null}
    </>
  );
}

/** One row in the history: a trip, or a single-shop order. */
type HistoryEntry = {
  key: string;
  trip: CustomerDelivery | null;
  parts: CustomerOrder[];
};

export default function CustomerOrdersScreen() {
  const { data: refunds } = useMyRefunds();
  const insets = useSafeAreaInsets();
  const bottomPadding = useScrollBottomPadding();
  const { user } = useSession();
  const { data: orders, isLoading, isError, error, refetch } = useMyOrders();
  // The customer's own trips (0092): a basket from several shops is one
  // order for the customer, and the reference they were given is the trip's.
  const { data: deliveries } = useMyDeliveries();
  // A shop's part of a trip (0092) is shown with the trip's reference: that
  // is the reference the customer can track and the one the trip answers to.
  // One row per trip (0092). A basket from several shops is one order for
  // the customer: one reference, one total, one delivery. The shops' own
  // actions live inside the trip's row, because a rating and a cancellation
  // are about a shop.
  const entries = useMemo(() => {
    const trips: HistoryEntry[] = [];
    for (const trip of deliveries ?? []) {
      const parts = (orders ?? []).filter((o) => o.delivery_id === trip.id);
      if (parts.length === 0) continue;
      trips.push({ key: `trip:${trip.id}`, trip, parts });
    }
    const singles: HistoryEntry[] = (orders ?? [])
      .filter((o) => !o.delivery_id)
      .map((o) => ({ key: `order:${o.id}`, trip: null, parts: [o] }));
    return [...trips, ...singles];
  }, [orders, deliveries]);
  const [mounted, setMounted] = useState(false);
  const { count, shops, replace } = useCart();
  const router = useRouter();
  const [reorderingRef, setReorderingRef] = useState<string | null>(null);
  const cancel = useCancelOrder();

  const { data: ratings } = useMyRatings();
  const rate = useRateOrder();
  const ratingByOrder = new Map((ratings ?? []).map((r) => [r.order_id, r]));

  const [ratingTarget, setRatingTarget] = useState<CustomerOrder | null>(null);
  const [restaurantStars, setRestaurantStars] = useState(0);
  const [riderStars, setRiderStars] = useState(0);
  const [comment, setComment] = useState("");

  function openRating(order: CustomerOrder) {
    const existing = ratingByOrder.get(order.id);
    setRestaurantStars(existing?.restaurant_rating ?? 0);
    setRiderStars(existing?.rider_rating ?? 0);
    setComment(existing?.comment ?? "");
    setRatingTarget(order);
  }

  function closeRating() {
    setRatingTarget(null);
    setRestaurantStars(0);
    setRiderStars(0);
    setComment("");
  }

  function submitRating() {
    if (!ratingTarget) return;
    if (restaurantStars < 1) {
      Alert.alert("Add a rating", "Tap a star to rate the restaurant.");
      return;
    }
    rate.mutate(
      {
        orderId: ratingTarget.id,
        restaurantRating: restaurantStars,
        // Ignored server-side when the order had no rider; sent only when it did.
        riderRating: ratingTarget.rider_id ? riderStars || null : null,
        comment: comment.trim() || null,
      },
      {
        onSuccess: closeRating,
        onError: (cause) =>
          Alert.alert(
            "Could not save rating",
            cause instanceof Error ? cause.message : "Try again."
          ),
      }
    );
  }

  function handleCancel(order: CustomerOrder) {
    Alert.alert(
      "Cancel this order?",
      `Order ${order.reference} will be cancelled. This cannot be undone.`,
      [
        { text: "Keep order", style: "cancel" },
        {
          text: "Cancel order",
          style: "destructive",
          onPress: () =>
            cancel.mutate(order.id, {
              onError: (cause) =>
                Alert.alert(
                  "Could not cancel",
                  cause instanceof Error ? cause.message : "Try again."
                ),
            }),
        },
      ]
    );
  }

  /**
   * Put a past order back in the cart. Rebuilds lines against today's menu (prices
   * and availability are today's, not the old order's) and confirms once if the
   * cart would be replaced or some items are gone -- a single dialog either way,
   * so the customer is never surprised by a silently different cart.
   */
  async function reorder(order: CustomerOrder) {
    if (reorderingRef) return;
    if (!order.restaurant_id) {
      Alert.alert("Cannot reorder", "This order is no longer linked to a place.");
      return;
    }
    const restaurantIdForOrder = order.restaurant_id;
    setReorderingRef(order.reference);
    try {
      const menu = await fetchMenu(restaurantIdForOrder);
      const { lines, unavailable } = buildReorder(order.items, menu);
      if (lines.length === 0) {
        Alert.alert(
          "Nothing available",
          unavailable.length
            ? `These items are no longer on the menu: ${unavailable.join(", ")}.`
            : "None of this order's items are available right now."
        );
        return;
      }

      const cartLines = lines.map((l) => ({
        ...l,
        restaurantId: restaurantIdForOrder,
        restaurantName: order.restaurant,
      }));
      // Reordering replaces the whole basket, so the customer is told when
      // the basket holds food from another place (a basket may now hold
      // several, 0092).
      const replacing =
        count > 0 && shops.some((s) => s.restaurantId !== restaurantIdForOrder);
      const go = () => {
        replace(cartLines);
        router.push("/customer/cart");
      };

      if (replacing || unavailable.length > 0) {
        const parts: string[] = [];
        if (replacing) parts.push(`Your cart has ${count} item(s) from another place.`);
        if (unavailable.length > 0)
          parts.push(`No longer available: ${unavailable.join(", ")}.`);
        Alert.alert(`Reorder ${order.restaurant}?`, parts.join(" "), [
          { text: "Cancel", style: "cancel" },
          { text: "Reorder", onPress: go },
        ]);
      } else {
        go();
      }
    } catch (cause) {
      Alert.alert(
        "Could not reorder",
        cause instanceof Error ? cause.message : "Try again."
      );
    } finally {
      setReorderingRef(null);
    }
  }

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
        <Ionicons name="alert-circle" size={30} color={colors.danger} />
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
        data={entries}
        keyExtractor={(row) => row.key}
        contentContainerStyle={[
          styles.list,
          { paddingTop: spacing.lg + insets.top, paddingBottom: bottomPadding },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            {/* No longer a tab: opened from Account or after checkout. */}
            <Pressable
              onPress={() =>
                router.canGoBack()
                  ? router.back()
                  : router.navigate("/customer/account")
              }
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={28} color={colors.text} />
            </Pressable>
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
        renderItem={({ item }) =>
          item.trip ? (
            <TripCard
              trip={item.trip}
              parts={item.parts}
              onReorder={reorder}
              reorderingRef={reorderingRef}
              onCancel={handleCancel}
              cancellingId={cancel.isPending ? cancel.variables : undefined}
              ratings={ratingByOrder}
              onRate={openRating}
              refunds={refunds}
            />
          ) : (
            <OrderCard
              order={item.parts[0]}
              onReorder={reorder}
              reordering={reorderingRef === item.parts[0]?.reference}
              onCancel={handleCancel}
              cancelling={cancel.isPending && cancel.variables === item.parts[0]?.id}
              rating={item.parts[0] ? ratingByOrder.get(item.parts[0].id) : undefined}
              onRate={openRating}
              refunded={item.parts[0] ? (refunds?.[item.parts[0].id] ?? 0) : 0}
            />
          )
        }
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => refetch()} />
        }
      />

      <Modal
        visible={ratingTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={closeRating}
      >
        <Pressable
          style={styles.backdrop}
          accessibilityLabel="Dismiss"
          onPress={closeRating}
        >
          <Pressable
            style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]}
            onPress={() => undefined}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
              <Text style={styles.sheetTitle}>
                Rate {ratingTarget?.restaurant ?? "your order"}
              </Text>
              <Text style={styles.sheetLabel}>The restaurant</Text>
              <StarRow value={restaurantStars} onChange={setRestaurantStars} />
              {ratingTarget?.rider_id ? (
                <>
                  <Text style={styles.sheetLabel}>Your rider</Text>
                  <StarRow value={riderStars} onChange={setRiderStars} />
                </>
              ) : null}
              <TextInput
                style={styles.commentInput}
                value={comment}
                onChangeText={setComment}
                placeholder="Leave a comment (optional)"
                placeholderTextColor={colors.textFaint}
                multiline
                numberOfLines={3}
                maxLength={500}
                editable={!rate.isPending}
              />
              <View style={styles.sheetActions}>
                <Pressable
                  style={[styles.sheetCancel, rate.isPending && styles.reorderDisabled]}
                  onPress={closeRating}
                  disabled={rate.isPending}
                >
                  <Text style={styles.sheetCancelLabel}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.sheetSubmit, rate.isPending && styles.reorderDisabled]}
                  onPress={submitRating}
                  disabled={rate.isPending}
                >
                  {rate.isPending ? (
                    <ActivityIndicator color={colors.textInverse} size="small" />
                  ) : (
                    <Text style={styles.sheetSubmitLabel}>Submit</Text>
                  )}
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function StarRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange(n)}
          accessibilityRole="button"
          accessibilityLabel={`${n} star${n === 1 ? "" : "s"}`}
        >
          <Ionicons
            name={n <= value ? "star" : "star-outline"}
            size={30}
            color={n <= value ? colors.accent : colors.border}
          />
        </Pressable>
      ))}
    </View>
  );
}

function OrderCard({
  order,
  trip,
  onReorder,
  reordering,
  onCancel,
  cancelling,
  rating,
  onRate,
  refunded,
}: {
  order: CustomerOrder;
  /** The trip this order is part of, when it is one shop of a basket. */
  trip?: CustomerDelivery;
  refunded: number;
  onReorder: (order: CustomerOrder) => void;
  reordering: boolean;
  onCancel: (order: CustomerOrder) => void;
  cancelling: boolean;
  rating: { restaurant_rating: number; rider_rating: number | null } | undefined;
  onRate: (order: CustomerOrder) => void;
}) {
  const router = useRouter();
  const cancelled = order.status === "cancelled";
  const delivered = order.status === "delivered";

  return (
    <Pressable
      style={({ pressed }) => [styles.card, shadow.card, pressed && styles.cardPressed]}
      onPress={() =>
        router.push({
          pathname: "/track",
          params: { ref: trip?.reference ?? order.reference },
        })
      }
    >
      <View style={styles.cardHead}>
        <View style={styles.cardHeadText}>
          {/* A shop's part of a trip is tracked by the TRIP's reference, so
              that is the reference the customer is given here (0092). */}
          <Text style={styles.ref}>{trip?.reference ?? order.reference}</Text>
          <Text style={type.body}>{order.restaurant}</Text>
          {trip ? (
            <Text style={type.caption}>
              {trip.shops === 1
                ? "1 restaurant in this delivery"
                : `Part of ${trip.shops} restaurants in one delivery`}
            </Text>
          ) : null}
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
      {refunded > 0 ? (
        <Text style={styles.refunded}>Refunded ₱{refunded.toFixed(2)}</Text>
      ) : null}

      <OrderActions
        order={order}
        refunded={refunded}
        rating={rating}
        onReorder={onReorder}
        reordering={reordering}
        onCancel={onCancel}
        cancelling={cancelling}
        onRate={onRate}
      />
    </Pressable>
  );
}

/**
 * A trip in the customer's history (0092).
 *
 * One basket from several shops is ONE order for the customer: one
 * reference, one total, one delivery. The shops are listed inside it with
 * their own status, because they decide separately, and each carries its own
 * actions.
 */
function TripCard({
  trip,
  parts,
  onReorder,
  reorderingRef,
  onCancel,
  cancellingId,
  ratings,
  onRate,
  refunds,
}: {
  trip: CustomerDelivery;
  parts: CustomerOrder[];
  onReorder: (order: CustomerOrder) => void;
  reorderingRef: string | null;
  onCancel: (order: CustomerOrder) => void;
  cancellingId: string | undefined;
  ratings: Map<string, { restaurant_rating: number; rider_rating: number | null }>;
  onRate: (order: CustomerOrder) => void;
  refunds?: Record<string, number>;
}) {
  const router = useRouter();
  const total = parts.reduce((sum, p) => sum + Number(p.total), 0);
  const status = parts[0]?.status ?? "pending";
  const cancelled = status === "cancelled";
  const delivered = status === "delivered";

  return (
    <View style={[styles.card, shadow.card]}>
      <Pressable
        style={({ pressed }) => [pressed && styles.cardPressed]}
        onPress={() =>
          router.push({ pathname: "/track", params: { ref: trip.reference } })
        }
        accessibilityRole="button"
        accessibilityLabel={`Track delivery ${trip.reference}`}
      >
        <View style={styles.cardHead}>
          <View style={styles.cardHeadText}>
            <Text style={styles.ref}>{trip.reference}</Text>
            <Text style={type.body}>
              {trip.shops === 1
                ? (parts[0]?.restaurant ?? "1 restaurant")
                : `${trip.shops} restaurants, one delivery`}
            </Text>
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
              {STATUS_LABEL[status] ?? status}
            </Text>
          </View>
        </View>
      </Pressable>

      {parts.map((part) => (
        <View key={part.id} style={styles.tripShop}>
          <View style={styles.tripShopHead}>
            <Text style={styles.tripShopName} numberOfLines={1}>
              {part.restaurant}
            </Text>
            <Text style={styles.tripShopStatus}>
              {STATUS_LABEL[part.status] ?? part.status}
            </Text>
          </View>
          <Text style={styles.items}>
            {part.items.map((i) => `${i.quantity}× ${i.name}`).join(" · ")}
          </Text>
          {part.status === "cancelled" ? (
            <Text style={styles.tripNote}>
              {part.rejection_reason ?? "This restaurant could not take it."}
            </Text>
          ) : null}
          {part.status === "delivered" ? (
            <Text style={styles.tripNote}>{part.delivery_failed_reason ?? null}</Text>
          ) : null}
          <OrderActions
            order={part}
            refunded={refunds?.[part.id] ?? 0}
            rating={ratings.get(part.id)}
            onReorder={onReorder}
            reordering={reorderingRef === part.reference}
            onCancel={onCancel}
            cancelling={cancellingId === part.id}
            onRate={onRate}
          />
        </View>
      ))}

      <View style={styles.cardFoot}>
        <Text style={type.caption}>
          {new Date(trip.placed_at).toLocaleDateString()}
        </Text>
        <Text style={type.price}>₱{total.toFixed(2)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  refunded: { ...type.caption, color: colors.success, fontWeight: "700" },
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
  tripShop: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 2,
  },
  tripShopHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  tripShopName: { ...type.label, color: colors.text, flex: 1 },
  tripShopStatus: { ...type.caption, color: colors.textMuted },
  tripNote: { ...type.caption, color: colors.danger },
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
  error: { ...type.body, color: colors.danger, textAlign: "center" },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  retryLabel: { ...type.label, color: colors.textInverse },
  reorderBtn: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  reorderDisabled: { opacity: 0.6 },
  reorderPressed: { backgroundColor: colors.primarySoft },
  reorderLabel: { ...type.label, color: colors.primary, fontWeight: "700" },
  cancelBtn: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  cancelPressed: { backgroundColor: colors.dangerSoft },
  cancelLabel: { ...type.label, color: colors.danger, fontWeight: "700" },
  rateBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  rateLabel: { ...type.label, color: colors.textInverse, fontWeight: "700" },
  ratedRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  ratedText: { ...type.caption, color: colors.textMuted, flex: 1 },
  ratedEdit: { ...type.label, color: colors.primary, fontWeight: "700" },
  starRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xs },
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
    gap: spacing.xs,
  },
  sheetTitle: { ...type.title, fontSize: 18, marginBottom: spacing.xs },
  sheetLabel: { ...type.eyebrow, marginTop: spacing.sm },
  commentInput: {
    ...type.body,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 80,
    marginTop: spacing.md,
    textAlignVertical: "top",
  },
  sheetActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  sheetCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  sheetCancelLabel: { ...type.label, color: colors.textMuted },
  sheetSubmit: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetSubmitLabel: { ...type.label, color: colors.textInverse, fontWeight: "700" },
});
