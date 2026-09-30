import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { colors, radius, shadow, spacing, type } from "../lib/theme";
import type { Database } from "../lib/database";

type TrackedOrder = Database["public"]["Functions"]["track_order"]["Returns"][number];

const STATUS_LABEL: Record<string, string> = {
  pending: "Order placed",
  confirmed: "Confirmed",
  preparing: "Being prepared",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/**
 * Public order tracking, mirroring the web page: call track_order(reference)
 * with the anon key, no session. The function is granted to anon and returns
 * a fixed projection, so this screen never touches the orders table directly.
 */
export function TrackOrderScreen({
  onBack,
  initialReference,
}: {
  onBack: () => void;
  initialReference?: string;
}) {
  const [reference, setReference] = useState(initialReference ?? "");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (initialReference) void handleTrack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleTrack() {
    setError(null);
    setOrder(null);
    const ref = reference.trim();
    if (!ref) {
      setError("Enter the reference from your receipt.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("track_order", {
        p_reference: ref,
      });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : undefined;
      if (!row) setError("No order found with that reference.");
      else setOrder(row);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tracking failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.inner, { paddingTop: spacing.lg + insets.top }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.link} onPress={onBack}>
          ‹ Back
        </Text>
        <View style={styles.heading}>
          <Text style={styles.title}>Track your order</Text>
          <Text style={styles.subtitle}>
            Enter the reference from your receipt, e.g. #KFD-1A2B3C4D5E6F.
          </Text>
        </View>

        <TextInput
          style={styles.input}
          value={reference}
          onChangeText={setReference}
          placeholder="Reference (#KFD-…)"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!loading}
          onSubmitEditing={handleTrack}
          returnKeyType="go"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            shadow.card,
            loading ? styles.buttonDisabled : null,
            pressed && !loading ? styles.buttonPressed : null,
          ]}
          disabled={loading}
          onPress={handleTrack}
        >
          {loading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.buttonLabel}>Track order</Text>
          )}
        </Pressable>

        {order ? <OrderCard order={order} /> : null}
      </ScrollView>
      <StatusBar style="dark" />
    </KeyboardAvoidingView>
  );
}

function OrderCard({ order }: { order: NonNullable<TrackedOrder> }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardRef}>{order.reference}</Text>
        <View
          style={[
            styles.status,
            order.status === "cancelled" && styles.statusCancelled,
            order.status === "delivered" && styles.statusDelivered,
          ]}
        >
          <Text
            style={[
              styles.statusLabel,
              order.status === "cancelled" && styles.statusLabelCancelled,
              order.status === "delivered" && styles.statusLabelDelivered,
            ]}
          >
            {STATUS_LABEL[order.status] ?? order.status}
          </Text>
        </View>
      </View>
      <Text style={styles.cardRestaurant}>{order.restaurant}</Text>
      <View style={styles.items}>
        {order.items.map((item) => (
          <View key={`${item.name}-${item.price}`} style={styles.itemRow}>
            <Text style={styles.itemName}>
              {item.quantity}× {item.name}
            </Text>
            <Text style={styles.itemPrice}>
              ₱{(Number(item.price) * Number(item.quantity)).toFixed(2)}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>₱{Number(order.total).toFixed(2)}</Text>
      </View>
      <Text style={styles.meta}>{new Date(order.placed_at).toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  link: { ...type.label, color: colors.secondary },
  heading: { gap: 2, marginBottom: spacing.xs },
  title: { ...type.display },
  subtitle: { ...type.body, color: colors.textMuted },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  error: { ...type.body, color: colors.danger, textAlign: "center" },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonPressed: { backgroundColor: colors.primaryDark },
  buttonLabel: { fontSize: 15, fontWeight: "800", color: colors.textInverse },
  card: {
    marginTop: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardRef: { ...type.heading, color: colors.primary },
  status: {
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  statusDelivered: { backgroundColor: colors.successSoft },
  statusCancelled: { backgroundColor: colors.dangerSoft },
  statusLabel: { fontSize: 11, fontWeight: "800", color: colors.warning },
  statusLabelDelivered: { color: colors.success },
  statusLabelCancelled: { color: colors.danger },
  cardRestaurant: { ...type.body, color: colors.textMuted },
  items: { gap: 4, marginTop: 4 },
  itemRow: { flexDirection: "row", justifyContent: "space-between" },
  itemName: { ...type.body, color: colors.text },
  itemPrice: { ...type.body, color: colors.text },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: 4,
  },
  totalLabel: { ...type.body, fontWeight: "700" },
  totalValue: { ...type.price },
  meta: { ...type.caption, color: colors.textFaint },
});
