import { useCallback, useEffect, useState } from "react";
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
import { supabase } from "../lib/supabase";
import { signOut } from "../lib/auth";

type RiderProfile = {
  id: string;
  name: string;
  city: string;
  vehicle: string;
  status: "online" | "busy" | "offline";
  deliveries: number;
  rating: number;
  earnings: number;
};

type AssignedOrder = {
  id: string;
  reference: string;
  customer: string;
  restaurant: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  status: string;
  payment: string;
  placed_at: string;
};

const RIDER_STATUSES = ["online", "busy", "offline"] as const;
type RiderStatus = (typeof RIDER_STATUSES)[number];

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/**
 * Rider surface. Reads the caller's own riders row (RLS scopes it to
 * user_id = auth.uid()) and the orders assigned to that rider by name
 * (0018's "riders read assigned orders" policy). Availability is the one
 * write a rider makes about themselves, an UPDATE on their own row.
 */
export function RiderHomeScreen({
  userId,
  onBackToLanding,
}: {
  userId: string;
  onBackToLanding: () => void;
}) {
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [orders, setOrders] = useState<AssignedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [{ data: rider }, { data: orderRows, error: ordersError }] =
      await Promise.all([
        supabase
          .from("riders")
          .select("id, name, city, vehicle, status, deliveries, rating, earnings")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("orders")
          .select(
            "id, reference, customer, restaurant, items, total, status, payment, placed_at"
          )
          .order("placed_at", { ascending: false }),
      ]);

    if (ordersError) {
      setError(ordersError.message);
      setLoading(false);
      return;
    }
    setProfile(
      rider
        ? {
            id: rider.id,
            name: rider.name,
            city: rider.city,
            vehicle: rider.vehicle,
            status: rider.status,
            deliveries: rider.deliveries,
            rating: rider.rating,
            earnings: rider.earnings,
          }
        : null
    );
    setOrders((orderRows ?? []) as AssignedOrder[]);
    setLoading(false);
  }, [userId]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function markDelivered(orderId: string) {
    setError(null);
    const { error } = await supabase.rpc("rider_mark_delivered", {
      p_order_id: orderId,
    });
    if (error) {
      setError(error.message);
      return;
    }
    await load();
  }

  async function setStatus(status: RiderStatus) {
    setUpdatingStatus(true);
    setError(null);
    const { error } = await supabase.rpc("rider_set_status", {
      p_status: status,
    });
    if (error) setError(error.message);
    else setProfile((p) => (p ? { ...p, status } : p));
    setUpdatingStatus(false);
  }

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>
          No rider profile is linked to this account.
        </Text>
        <Pressable style={styles.linkButton} onPress={onBackToLanding}>
          <Text style={styles.linkLabel}>Back</Text>
        </Pressable>
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{profile.name}</Text>
          <Pressable
            style={styles.signOut}
            onPress={() => {
              void signOut();
            }}
          >
            <Text style={styles.signOutLabel}>Sign out</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          {profile.city} · {profile.vehicle}
        </Text>
        <View style={styles.statsRow}>
          <Text style={styles.stat}>Deliveries: {profile.deliveries}</Text>
          <Text style={styles.stat}>Rating: {Number(profile.rating).toFixed(1)}</Text>
          <Text style={styles.stat}>₱{Number(profile.earnings).toFixed(2)}</Text>
        </View>

        <View style={styles.availability}>
          <Text style={styles.availabilityLabel}>Availability</Text>
          <View style={styles.statusButtons}>
            {RIDER_STATUSES.map((s) => {
              const active = profile.status === s;
              return (
                <Pressable
                  key={s}
                  style={[
                    styles.statusButton,
                    active && styles.statusButtonActive,
                    updatingStatus && styles.disabled,
                  ]}
                  disabled={updatingStatus}
                  onPress={() => void setStatus(s)}
                >
                  <Text
                    style={[
                      styles.statusButtonLabel,
                      active && styles.statusButtonLabelActive,
                    ]}
                  >
                    {s}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
        ListHeaderComponent={
          <Text style={styles.sectionTitle}>Your deliveries</Text>
        }
        ListEmptyComponent={<Text style={styles.empty}>No deliveries assigned yet.</Text>}
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
                  style={styles.deliverButton}
                  onPress={() => void markDelivered(item.id)}
                >
                  <Text style={styles.deliverButtonLabel}>Mark delivered</Text>
                </Pressable>
              ) : null}
            </View>
          );
        }}
      />
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
    backgroundColor: "#fff",
  },
  header: { padding: 20, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e2e2e2" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "800", color: "#111" },
  subtitle: { fontSize: 14, color: "#666" },
  signOut: { paddingVertical: 6, paddingHorizontal: 10 },
  signOutLabel: { color: "#b42318", fontSize: 14, fontWeight: "600" },
  statsRow: { flexDirection: "row", gap: 12, marginTop: 2 },
  stat: { fontSize: 13, color: "#555" },
  availability: { marginTop: 10, gap: 6 },
  availabilityLabel: { fontSize: 13, fontWeight: "700", color: "#333" },
  statusButtons: { flexDirection: "row", gap: 8 },
  statusButton: {
    borderWidth: 1,
    borderColor: "#d1d1d1",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
  },
  statusButtonActive: { backgroundColor: "#111", borderColor: "#111" },
  statusButtonLabel: { fontSize: 14, color: "#111", textTransform: "capitalize" },
  statusButtonLabelActive: { color: "#fff", fontWeight: "700" },
  disabled: { opacity: 0.6 },
  error: { fontSize: 14, color: "#b42318", marginTop: 8 },
  list: { padding: 20, gap: 10 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: "#111", marginBottom: 4 },
  empty: { fontSize: 14, color: "#888" },
  orderCard: {
    borderWidth: 1,
    borderColor: "#e2e2e2",
    borderRadius: 12,
    padding: 14,
    gap: 4,
    backgroundColor: "#fafafa",
  },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderRef: { fontSize: 15, fontWeight: "800", color: "#111" },
  orderStatus: { fontSize: 13, fontWeight: "700", color: "#6b4eff" },
  orderRestaurant: { fontSize: 14, color: "#444" },
  orderCustomer: { fontSize: 13, color: "#666" },
  orderTotal: { fontSize: 12, color: "#999", marginTop: 2 },
  deliverButton: {
    marginTop: 10,
    backgroundColor: "#177245",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  deliverButtonLabel: { fontSize: 15, fontWeight: "700", color: "#fff" },
  linkButton: {
    borderWidth: 1,
    borderColor: "#d1d1d1",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  linkLabel: { fontSize: 15, fontWeight: "600", color: "#111" },
});