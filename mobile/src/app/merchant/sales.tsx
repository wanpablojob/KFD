import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  MerchantLoading,
  MerchantScreen,
  MerchantSection,
  ui,
} from "../../components/MerchantUi";
import {
  useDeliveredAllTime,
  useMerchantOrders,
  useMerchantRefunds,
} from "../../lib/merchant";
import {
  allTimeTotals,
  itemSummary,
  ordersInWindow,
  salesTotals,
  type SalesWindow,
} from "../../lib/merchant-logic";
import { colors, radius, spacing, type } from "../../lib/theme";

const peso = (n: number) => `₱${n.toFixed(2)}`;

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting",
  confirmed: "Accepted",
  preparing: "Preparing",
  out_for_delivery: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const timeFormat = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
});
const dayTimeFormat = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Same figures as the web Sales page: delivered food subtotal, net of refunds.
 * Tap a period to see every order placed in it, whatever its status.
 */
export default function MerchantSalesScreen() {
  const orders = useMerchantOrders();
  const refunds = useMerchantRefunds();
  const allTime = useDeliveredAllTime();
  const [open, setOpen] = useState<SalesWindow | null>("today");

  if (orders.isPending || refunds.isPending)
    return <MerchantLoading message="Loading sales…" />;

  const now = new Date();
  const refundMap = refunds.data ?? new Map<string, number>();
  const totals = salesTotals(orders.data ?? [], refundMap, now);
  const lifetime = allTime.data ? allTimeTotals(allTime.data, refundMap) : null;
  const periods: { key: SalesWindow; label: string; orders: number; sales: number }[] =
    [
      { key: "today", label: "Today", ...totals.today },
      { key: "week", label: "Last 7 days", ...totals.week },
      { key: "month", label: "Last 30 days", ...totals.month },
    ];
  const listed = open ? ordersInWindow(orders.data ?? [], open, now) : [];

  return (
    <MerchantScreen
      title="Sales"
      subtitle="Food sales from delivered orders, net of refunds"
      refreshing={orders.isRefetching}
      onRefresh={() => {
        void orders.refetch();
        void refunds.refetch();
        void allTime.refetch();
      }}
    >
      {orders.isError || refunds.isError ? (
        <Text style={ui.error}>Could not load sales. Pull down to retry.</Text>
      ) : null}

      {periods.map((p) => (
        <Pressable
          key={p.key}
          onPress={() => setOpen(open === p.key ? null : p.key)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open === p.key }}
          accessibilityLabel={`${p.label}, ${peso(p.sales)}, show orders`}
        >
          <MerchantSection label={p.label}>
            <View style={styles.row}>
              <Text style={styles.amount}>{peso(p.sales)}</Text>
              <Text style={ui.muted}>
                {p.orders} delivered ·{" "}
                {open === p.key ? "Hide orders ▲" : "See orders ▼"}
              </Text>
            </View>
          </MerchantSection>
        </Pressable>
      ))}

      <MerchantSection label="All time">
        <View style={styles.row}>
          <Text style={styles.amount}>{lifetime ? peso(lifetime.sales) : "—"}</Text>
          <Text style={ui.muted}>
            {lifetime
              ? `${lifetime.orders} delivered ${lifetime.orders === 1 ? "order" : "orders"}`
              : allTime.isError
                ? "Could not load"
                : "Loading…"}
          </Text>
        </View>
      </MerchantSection>

      {open ? (
        <MerchantSection
          label={`Orders · ${periods.find((p) => p.key === open)?.label}`}
        >
          {listed.length === 0 ? (
            <Text style={ui.muted}>No orders in this period.</Text>
          ) : (
            listed.map((o) => {
              const refunded = refundMap.get(o.id) ?? 0;
              return (
                <View key={o.id} style={styles.order}>
                  <View style={styles.orderTop}>
                    <Text style={type.label}>
                      {o.reference} ·{" "}
                      {(open === "today" ? timeFormat : dayTimeFormat).format(
                        new Date(o.placedAt)
                      )}
                    </Text>
                    <Text
                      style={[
                        styles.status,
                        o.status === "cancelled" && styles.cancelled,
                      ]}
                    >
                      {STATUS_LABEL[o.status] ?? o.status}
                    </Text>
                  </View>
                  <Text style={ui.body}>{itemSummary(o.items)}</Text>
                  <Text style={ui.muted}>
                    {o.customer} · {peso(o.subtotal)}
                    {refunded > 0 ? ` · refunded ${peso(refunded)}` : ""}
                    {o.status === "cancelled" && o.rejectionReason
                      ? ` · ${o.rejectionReason}`
                      : ""}
                  </Text>
                </View>
              );
            })
          )}
        </MerchantSection>
      ) : null}

      <Text style={ui.muted}>
        Delivery and service fees are not included, and commission is not deducted. CSV
        downloads are on the web portal.
      </Text>
    </MerchantScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  amount: { ...type.display, fontSize: 24 },
  order: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 2,
  },
  orderTop: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  status: {
    ...type.caption,
    color: colors.secondary,
    fontWeight: "700",
    borderRadius: radius.pill,
  },
  cancelled: { color: colors.danger },
});
