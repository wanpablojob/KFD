import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRiderEarningsSummary, useRiderPayoutHistory } from "../../lib/hooks";
import { useSession } from "../../lib/session-context";
import { colors, radius, shadow, spacing, type } from "../../lib/theme";

/**
 * Earnings tab.
 *
 * Every peso figure here is summed from the `rider_payouts` ledger, which has
 * one row per completed delivery. The old screen divided `riders.earnings` by
 * `riders.deliveries`, and since nothing in the schema ever wrote `earnings`
 * that division was arithmetic on two fixture numbers from the 0001 seed --
 * a rider with zero deliveries in reality was shown a confident "₱15.60 per
 * delivery". Dividing an average is also the wrong question: a rider wants to
 * know what today paid and what each trip was worth.
 */

const PAGE = 20;

function peso(value: number): string {
  return `₱${Number(value).toFixed(2)}`;
}

/** Short, unambiguous: "Mar 4, 2:15 PM" reads better than a full ISO string. */
function earnedLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function RiderEarningsRoute() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const [limit, setLimit] = useState(PAGE);

  const summary = useRiderEarningsSummary();
  const history = useRiderPayoutHistory(limit);

  const loading = summary.isLoading;
  const error = summary.error ?? history.error;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={type.caption}>Loading…</Text>
        <StatusBar style="dark" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={styles.error}>
          {error instanceof Error ? error.message : "Failed to load earnings."}
        </Text>
        <StatusBar style="dark" />
      </View>
    );
  }

  const totals = summary.data;
  const rows = history.data?.items ?? [];
  const hasMore = history.data?.hasMore ?? false;
  const firstEarned = totals?.first_earned_at
    ? `Since ${new Date(totals.first_earned_at).toLocaleDateString()}`
    : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
    >
      <View style={[styles.header, { paddingTop: spacing.lg + insets.top }]}>
        <Text style={type.eyebrow}>Earnings</Text>
        <Text style={styles.today}>{peso(totals?.earned_today ?? 0)}</Text>
        <Text style={type.caption}>Earned today</Text>
      </View>

      <View style={styles.periods}>
        <View style={[styles.period, shadow.card]}>
          <Text style={styles.periodValue}>{peso(totals?.earned_week ?? 0)}</Text>
          <Text style={type.caption}>This week</Text>
        </View>
        <View style={[styles.period, shadow.card]}>
          <Text style={styles.periodValue}>{peso(totals?.lifetime ?? 0)}</Text>
          <Text style={type.caption}>Lifetime</Text>
        </View>
        <View style={[styles.period, shadow.card]}>
          <Text style={styles.periodValue}>{totals?.delivery_count ?? 0}</Text>
          <Text style={type.caption}>Deliveries</Text>
        </View>
      </View>

      {firstEarned ? <Text style={styles.since}>{firstEarned}</Text> : null}

      <View style={styles.section}>
        <Text style={type.eyebrow}>Each delivery</Text>

        {rows.length === 0 ? (
          <View style={[styles.empty, shadow.card]}>
            <Text style={styles.emptyTitle}>No completed deliveries yet</Text>
            <Text style={styles.emptyBody}>
              {firstEarned
                ? "Claim an order, then mark it delivered and it will show up here with the fee it paid."
                : "Earnings start appearing here after your first delivery on this device's account. Older deliveries have no recorded payout, so they are left out rather than guessed at."}
            </Text>
          </View>
        ) : (
          <View style={[styles.list, shadow.card]}>
            {rows.map((row, index) => (
              <View
                key={row.order_id}
                style={index === 0 ? styles.row : [styles.row, styles.rowDivided]}
              >
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {row.restaurant}
                  </Text>
                  <Text style={type.caption}>
                    {row.order_reference} · {earnedLabel(row.earned_at)}
                  </Text>
                </View>
                <Text style={styles.rowAmount}>{peso(row.amount)}</Text>
              </View>
            ))}
          </View>
        )}

        {hasMore ? (
          <Pressable
            onPress={() => setLimit((n) => n + PAGE)}
            style={({ pressed }) => [styles.more, pressed && styles.morePressed]}
          >
            <Text style={styles.moreLabel}>Show earlier deliveries</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.footnote}>
        {user ? `Signed in as ${user.email ?? "this rider"}. ` : ""}
        Figures are per delivery, taken from the payout recorded when the order was
        completed.
      </Text>
      <StatusBar style="dark" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  error: {
    ...type.body,
    color: colors.danger,
    padding: spacing.xl,
    textAlign: "center",
  },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: 2 },
  today: { ...type.display, fontSize: 40, color: colors.primary },
  periods: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  period: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    gap: 2,
  },
  periodValue: { ...type.heading, fontSize: 15 },
  since: {
    ...type.caption,
    color: colors.textFaint,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: spacing.md },
  list: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
  },
  rowDivided: { borderTopWidth: 1, borderTopColor: colors.border },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...type.body, fontWeight: "600" },
  rowAmount: { ...type.price, fontSize: 15 },
  empty: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: { ...type.heading, fontSize: 15 },
  emptyBody: { ...type.caption, color: colors.textMuted, lineHeight: 17 },
  more: {
    alignSelf: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  morePressed: { backgroundColor: colors.surface },
  moreLabel: { ...type.label, color: colors.primary },
  footnote: {
    ...type.caption,
    color: colors.textFaint,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    lineHeight: 16,
  },
});
