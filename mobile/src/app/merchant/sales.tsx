import { StyleSheet, Text, View } from "react-native";
import {
  MerchantLoading,
  MerchantScreen,
  MerchantSection,
  ui,
} from "../../components/MerchantUi";
import { useMerchantOrders, useMerchantRefunds } from "../../lib/merchant";
import { salesTotals } from "../../lib/merchant-logic";
import { spacing, type } from "../../lib/theme";

const peso = (n: number) => `₱${n.toFixed(2)}`;

/** Same figures as the web Sales page: delivered food subtotal, net of refunds. */
export default function MerchantSalesScreen() {
  const orders = useMerchantOrders();
  const refunds = useMerchantRefunds();

  if (orders.isPending || refunds.isPending)
    return <MerchantLoading message="Loading sales…" />;

  const totals = salesTotals(orders.data ?? [], refunds.data ?? new Map(), new Date());
  const rows = [
    { label: "Today", ...totals.today },
    { label: "Last 7 days", ...totals.week },
    { label: "Last 30 days", ...totals.month },
  ];

  return (
    <MerchantScreen
      title="Sales"
      subtitle="Food sales from delivered orders, net of refunds"
      refreshing={orders.isRefetching}
      onRefresh={() => {
        void orders.refetch();
        void refunds.refetch();
      }}
    >
      {orders.isError || refunds.isError ? (
        <Text style={ui.error}>Could not load sales. Pull down to retry.</Text>
      ) : null}
      {rows.map((row) => (
        <MerchantSection key={row.label} label={row.label}>
          <View style={styles.row}>
            <Text style={styles.amount}>{peso(row.sales)}</Text>
            <Text style={ui.muted}>
              {row.orders} delivered {row.orders === 1 ? "order" : "orders"}
            </Text>
          </View>
        </MerchantSection>
      ))}
      <Text style={ui.muted}>
        Delivery and service fees are not included, and commission is not deducted.
        Daily breakdowns and CSV downloads are on the web portal.
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
});
