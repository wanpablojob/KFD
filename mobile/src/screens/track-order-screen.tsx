import { useState } from "react";
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
import { supabase } from "../lib/supabase";

type TrackedOrder = {
  reference: string;
  restaurant: string;
  items: { name: string; quantity: number; price: number }[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  status: string;
  payment: string;
  placed_at: string;
} | null;

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
export function TrackOrderScreen({ onBack }: { onBack: () => void }) {
  const [reference, setReference] = useState("");
  const [order, setOrder] = useState<TrackedOrder>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      else setOrder(row as TrackedOrder);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Tracking failed. Try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.link} onPress={onBack}>
          ‹ Back
        </Text>
        <Text style={styles.title}>Track your order</Text>
        <Text style={styles.subtitle}>
          Enter the reference from your receipt, e.g. KFD-1A2B3C4D5E6F.
        </Text>

        <TextInput
          style={styles.input}
          value={reference}
          onChangeText={setReference}
          placeholder="Reference (KFD-…)"
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!loading}
          onSubmitEditing={handleTrack}
          returnKeyType="go"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, loading ? styles.buttonDisabled : null]}
          disabled={loading}
          onPress={handleTrack}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonLabel}>Track</Text>
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
        <Text style={[styles.status, order.status === "cancelled" && styles.statusCancelled, order.status === "delivered" && styles.statusDelivered]}>
          {STATUS_LABEL[order.status] ?? order.status}
        </Text>
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
      <Text style={styles.meta}>
        {new Date(order.placed_at).toLocaleString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  inner: { padding: 24, gap: 12 },
  link: { fontSize: 15, color: "#666" },
  title: { fontSize: 26, fontWeight: "800", color: "#111" },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d1d1",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111",
  },
  error: { fontSize: 14, color: "#b42318" },
  button: {
    backgroundColor: "#111",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonLabel: { fontSize: 16, fontWeight: "700", color: "#fff" },
  card: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#e2e2e2",
    borderRadius: 12,
    padding: 16,
    gap: 8,
    backgroundColor: "#fafafa",
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardRef: { fontSize: 16, fontWeight: "800", color: "#111" },
  status: { fontSize: 14, fontWeight: "700", color: "#6b4eff" },
  statusDelivered: { color: "#177245" },
  statusCancelled: { color: "#b42318" },
  cardRestaurant: { fontSize: 15, color: "#444" },
  items: { gap: 4, marginTop: 4 },
  itemRow: { flexDirection: "row", justifyContent: "space-between" },
  itemName: { fontSize: 14, color: "#333" },
  itemPrice: { fontSize: 14, color: "#333" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ddd",
    paddingTop: 8,
    marginTop: 4,
  },
  totalLabel: { fontSize: 15, fontWeight: "700", color: "#111" },
  totalValue: { fontSize: 15, fontWeight: "800", color: "#111" },
  meta: { fontSize: 12, color: "#999" },
});