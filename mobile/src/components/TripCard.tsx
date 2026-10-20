import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useDeliveryStops } from "../lib/hooks";
import type { DeliveryStop, RiderDelivery } from "../lib/storefront";
import { colors, radius, shadow, spacing, type } from "../lib/theme";

/**
 * A trip on the rider's list (0092).
 *
 * One basket from several shops is ONE delivery for the rider: one address, one
 * drop-off, one amount to collect. The shops are the stops, and each stop is
 * marked picked up on its own -- the rider collects from every kitchen before
 * the bag leaves the last one.
 *
 * The stops are fetched here rather than passed in, so a card can be rendered
 * without the screen knowing which trips are on it.
 */
export function TripCard({
  trip,
  busy,
  pickingUpId,
  onPickUp,
  onComplete,
  onReportFailed,
}: {
  trip: RiderDelivery;
  busy: boolean;
  /** The stop being marked picked up right now, so only that row waits. */
  pickingUpId: string | null;
  onPickUp: (orderId: string) => void;
  onComplete: () => void;
  onReportFailed: () => void;
}) {
  const { data: stops } = useDeliveryStops(trip.delivery_id);
  const list: DeliveryStop[] = useMemo(() => stops ?? [], [stops]);

  const cash = trip.payment === "cash";
  const canDeliver =
    trip.status === "out_for_delivery" ||
    trip.status === "preparing" ||
    trip.status === "confirmed";

  return (
    <View style={[styles.card, shadow.card]}>
      <View style={styles.header}>
        <Text style={styles.reference}>{trip.reference}</Text>
        <Text style={styles.status}>{TRIP_STATUS[trip.status] ?? trip.status}</Text>
      </View>

      <Text style={styles.shops}>
        {trip.shops === 1
          ? (list[0]?.restaurant ?? "1 restaurant")
          : `${trip.shops} restaurants, one delivery`}
      </Text>

      {/* What the rider has to collect: the trip's grand total, once. The
          customer paid one bill. */}
      {canDeliver && cash ? (
        <View style={styles.collect}>
          <Text style={styles.collectLabel}>Collect from customer</Text>
          <Text style={styles.collectAmount}>₱{Number(trip.total).toFixed(2)}</Text>
        </View>
      ) : null}

      {/* The stops: the shops to collect from, each with its own food. */}
      {list.map((stop) => {
        const collected =
          stop.status === "out_for_delivery" || stop.status === "delivered";
        return (
          <View key={stop.order_id} style={styles.stop}>
            <View style={styles.stopHead}>
              <Text style={styles.stopName} numberOfLines={1}>
                {stop.restaurant}
              </Text>
              <Text style={styles.stopSubtotal}>
                ₱{Number(stop.subtotal).toFixed(2)}
              </Text>
            </View>
            {stop.items.map((item, index) => (
              <View key={`${item.menu_item_id}-${index}`} style={styles.itemRow}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.quantity}× {item.name}
                </Text>
              </View>
            ))}
            {collected ? (
              <Text style={styles.collected}>Picked up</Text>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.pickUp,
                  pressed && styles.pickUpPressed,
                ]}
                onPress={() => onPickUp(stop.order_id)}
                disabled={busy || pickingUpId === stop.order_id}
                accessibilityRole="button"
                accessibilityLabel={`Mark ${stop.restaurant} picked up`}
              >
                <Ionicons name="bag-handle-outline" size={16} color={colors.primary} />
                <Text style={styles.pickUpLabel}>
                  {pickingUpId === stop.order_id ? "Marking…" : "Picked up here"}
                </Text>
              </Pressable>
            )}
          </View>
        );
      })}

      <View style={styles.block}>
        <Text style={styles.blockLabel}>Deliver to</Text>
        <Text style={styles.blockValue}>
          {trip.customer}
          {trip.delivery_address ? `\n${trip.delivery_address}` : ""}
        </Text>
      </View>

      {trip.customer_phone ? (
        <Pressable
          style={styles.callRow}
          accessibilityRole="link"
          accessibilityLabel={`Call ${trip.customer}`}
          onPress={() =>
            void Linking.openURL(`tel:${trip.customer_phone}`).catch(() => undefined)
          }
        >
          <Text style={styles.callLabel}>Call customer</Text>
          <Text style={styles.callNumber}>{trip.customer_phone}</Text>
        </Pressable>
      ) : null}

      {canDeliver ? (
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryAction,
              pressed && styles.actionPressed,
            ]}
            onPress={onComplete}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Complete the delivery of ${trip.reference}`}
          >
            <Text style={styles.primaryActionLabel}>Complete delivery</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryAction,
              pressed && styles.actionPressed,
            ]}
            onPress={onReportFailed}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Report a problem with ${trip.reference}`}
          >
            <Text style={styles.secondaryActionLabel}>Cannot deliver</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const TRIP_STATUS: Record<string, string> = {
  pending: "Waiting for the shops",
  confirmed: "All shops accepted",
  preparing: "Being prepared",
  out_for_delivery: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  reference: { ...type.label, color: colors.text },
  status: { ...type.caption, color: colors.textMuted },
  shops: { ...type.body, color: colors.text, fontWeight: "700" },
  collect: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  collectLabel: { ...type.caption, color: colors.textMuted },
  collectAmount: { ...type.price, color: colors.primaryDark },
  stop: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 2,
  },
  stopHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  stopName: { ...type.label, color: colors.text, flex: 1 },
  stopSubtotal: { ...type.label, color: colors.textMuted },
  itemRow: { flexDirection: "row", justifyContent: "space-between" },
  itemName: { ...type.caption, color: colors.textMuted, flex: 1 },
  collected: { ...type.caption, color: colors.textFaint },
  pickUp: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
  },
  pickUpPressed: { opacity: 0.6 },
  pickUpLabel: { ...type.label, color: colors.primary },
  block: { gap: 2 },
  blockLabel: { ...type.caption, color: colors.textMuted },
  blockValue: { ...type.body, color: colors.text },
  callRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  callLabel: { ...type.label, color: colors.primary },
  callNumber: { ...type.body, color: colors.text },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  primaryAction: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  primaryActionLabel: { fontSize: 15, fontWeight: "700", color: colors.textInverse },
  secondaryAction: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  secondaryActionLabel: { ...type.label, color: colors.textMuted },
  actionPressed: { opacity: 0.7 },
});
