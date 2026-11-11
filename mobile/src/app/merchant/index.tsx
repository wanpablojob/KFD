import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Link } from "expo-router";
import {
  MerchantButton,
  MerchantLoading,
  MerchantScreen,
  MerchantSection,
  ui,
} from "../../components/MerchantUi";
import { useSession } from "../../lib/session-context";
import {
  useMerchantOrders,
  useSetMerchantOrderStatus,
  useStoreStatus,
  type MerchantOrder,
} from "../../lib/merchant";
import {
  itemSummary,
  minutesWaiting,
  OVERDUE_MINUTES,
  todayCounts,
  type OrderStatus,
} from "../../lib/merchant-logic";
import { colors, radius, spacing, type } from "../../lib/theme";

const peso = (n: number) => `₱${n.toFixed(2)}`;

/** An order this new carries a NEW tag, next to the push the phone already got. */
const NEW_FOR_MINUTES = 3;

/**
 * The kitchen's live screen. Every order is accepted the moment it is placed
 * (0132) and offered to riders at once, so there is nothing to accept: new
 * orders arrive here (and as a push) ready to cook, oldest first and red once
 * not started after OVERDUE_MINUTES. Then what is cooking. Cancel, with a
 * reason the customer sees, is for an order the shop truly cannot make.
 */
export default function MerchantOrdersScreen() {
  const { role } = useSession();
  const restaurantId = role?.restaurantId ?? null;
  const orders = useMerchantOrders();
  const store = useStoreStatus(restaurantId);
  const setStatus = useSetMerchantOrderStatus();
  const [cancelling, setCancelling] = useState<MerchantOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keeps "N min ago" counting between polls.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (orders.isPending) return <MerchantLoading message="Loading orders…" />;

  const rows = orders.data ?? [];
  // "pending" only survives on an order placed before 0132 or mid-accept; the
  // server accepts it within minutes either way, so it is shown as new too.
  const fresh = rows
    .filter((o) => o.status === "pending" || o.status === "confirmed")
    .sort((a, b) => a.placedAt.localeCompare(b.placedAt));
  const cooking = rows.filter((o) => o.status === "preparing");
  const counts = todayCounts(rows, now);

  async function move(order: MerchantOrder, status: OrderStatus, reason?: string) {
    setError(null);
    try {
      await setStatus.mutateAsync({ orderId: order.id, status, reason });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the order.");
    }
  }

  const busyId = setStatus.isPending ? setStatus.variables?.orderId : undefined;

  return (
    <MerchantScreen
      title={role?.restaurantName ?? "Orders"}
      subtitle={`${fresh.length} new · ${counts.today} today`}
      refreshing={orders.isRefetching}
      onRefresh={() => void orders.refetch()}
    >
      {store.data && !store.data.isOpen ? (
        <Link href="/merchant/account" style={styles.closed}>
          <Text style={styles.closedText}>
            Your store is closed. Customers cannot order. Tap to open it.
          </Text>
        </Link>
      ) : null}

      {orders.isError ? (
        <Text style={ui.error}>Could not load orders. Pull down to retry.</Text>
      ) : null}
      {error ? <Text style={ui.error}>{error}</Text> : null}

      <MerchantSection label={`New orders (${fresh.length})`}>
        {fresh.length === 0 ? (
          <Text style={ui.muted}>
            No new orders. They appear here, already accepted, the moment a customer
            orders, and this phone gets a notification.
          </Text>
        ) : (
          fresh.map((order) => (
            <OrderCard key={order.id} order={order} now={now}>
              {order.status === "confirmed" ? (
                <MerchantButton
                  label="Start preparing"
                  busy={busyId === order.id}
                  onPress={() => void move(order, "preparing")}
                />
              ) : null}
              <MerchantButton
                label="Cancel"
                tone="danger"
                disabled={!!busyId}
                onPress={() => setCancelling(order)}
              />
            </OrderCard>
          ))
        )}
      </MerchantSection>

      <MerchantSection label={`Preparing (${cooking.length})`}>
        {cooking.length === 0 ? (
          <Text style={ui.muted}>Nothing cooking.</Text>
        ) : (
          cooking.map((order) => (
            <OrderCard key={order.id} order={order} now={now}>
              <MerchantButton
                label="Cancel"
                tone="danger"
                disabled={!!busyId}
                onPress={() => setCancelling(order)}
              />
            </OrderCard>
          ))
        )}
      </MerchantSection>

      <CancelDialog
        order={cancelling}
        onCancel={() => setCancelling(null)}
        onConfirm={(reason) => {
          const order = cancelling;
          setCancelling(null);
          if (order) void move(order, "cancelled", reason);
        }}
      />
    </MerchantScreen>
  );
}

function OrderCard({
  order,
  now,
  children,
}: {
  order: MerchantOrder;
  now: Date;
  children: React.ReactNode;
}) {
  const waited = minutesWaiting(order.placedAt, now);
  const notStarted = order.status === "pending" || order.status === "confirmed";
  const overdue = notStarted && waited >= OVERDUE_MINUTES;
  const isNew = notStarted && waited < NEW_FOR_MINUTES;
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.referenceRow}>
          <Text style={styles.reference}>{order.reference}</Text>
          {isNew ? (
            <View style={styles.newTag}>
              <Text style={styles.newTagText}>NEW</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.age, overdue && styles.ageOverdue]}>
          {waited === 0 ? "just now" : `${waited} min ago`}
        </Text>
      </View>
      <Text style={ui.body}>{itemSummary(order.items)}</Text>
      <Text style={ui.muted}>
        {order.customer} · {peso(order.subtotal)}
        {order.rider ? ` · Rider: ${order.rider}` : " · Finding a rider…"}
      </Text>
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

/** A reason is required to cancel; the customer sees it (Prompt 2.5). */
function CancelDialog({
  order,
  onCancel,
  onConfirm,
}: {
  order: MerchantOrder | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const close = () => {
    setReason("");
    onCancel();
  };
  return (
    <Modal
      visible={order !== null}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Dismiss">
        <Pressable style={styles.dialog} onPress={() => {}}>
          <Text style={type.heading}>Cancel {order?.reference}?</Text>
          <Text style={ui.muted}>Tell the customer why. They will see this.</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Out of chicken today"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            autoFocus
          />
          <View style={styles.actions}>
            <MerchantButton label="Keep order" tone="outline" onPress={close} />
            <MerchantButton
              label="Cancel order"
              tone="danger"
              disabled={!reason.trim()}
              onPress={() => {
                const text = reason.trim();
                setReason("");
                onConfirm(text);
              }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  closed: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  closedText: { ...type.body, color: colors.danger, fontWeight: "600" },
  card: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  referenceRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  reference: { ...type.heading },
  newTag: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  newTagText: { color: colors.textInverse, fontSize: 11, fontWeight: "800" },
  age: { ...type.caption, color: colors.textMuted },
  ageOverdue: { color: colors.danger, fontWeight: "700" },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  dialog: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
});
