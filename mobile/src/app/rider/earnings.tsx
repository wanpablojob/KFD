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
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScrollBottomPadding } from "../../components/TabBarInset";
import {
  useRiderCashPosition,
  useRiderEarningsSummary,
  useRiderPayoutHistory,
} from "../../lib/hooks";
import { cashOnHandLabel } from "../../lib/rider-cash";
import { fetchMyDeliveredPabakal, pabakalEarnings } from "../../lib/pabakal";
import {
  BUCKET_LABEL,
  bucketTotal,
  groupPayoutsByDay,
  needsRiderAttention,
} from "../../lib/payout-groups";
import { useSession } from "../../lib/session-context";
import { colors, radius, shadow, spacing, type } from "../../lib/theme";

/**
 * Earnings tab.
 *
 * Every peso figure here is summed from the `rider_payouts` ledger, which has
 * one row per completed delivery. The old screen divided `riders.earnings` by
 * `riders.deliveries`, and at the time nothing in the schema wrote either --
 * both were fixture numbers from the 0001 seed, so a rider with zero real
 * deliveries was shown a confident "₱15.60 per delivery".
 *
 * Migration 0038 changed that: `rider_mark_delivered` now writes the ledger row
 * and increments both counters in the same statement, and 0038 reconciled
 * `riders.earnings` to the ledger sum. So the two columns are no longer fiction
 * -- but `deliveries` was never reset, so it still carries pre-0038 counts the
 * ledger has no record of. That is why this screen and the Profile tab both read
 * the ledger instead of the counters, and it is why the counts here and on the
 * Profile tab can differ from an admin's riders table by the deliveries that
 * predate the ledger.
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
  const bottomPadding = useScrollBottomPadding();
  const { user } = useSession();
  const [limit, setLimit] = useState(PAGE);

  const summary = useRiderEarningsSummary();
  const history = useRiderPayoutHistory(limit);
  const cash = useRiderCashPosition();
  // Pabakal is paid by the customer in cash and the rider keeps both fees, so
  // it is neither ledger earnings nor cash owed to KFD: it gets its own card.
  const pabakal = useQuery({
    queryKey: ["pabakal", "earnings"],
    queryFn: fetchMyDeliveredPabakal,
  });
  const pabakalTotals = pabakalEarnings(pabakal.data ?? [], new Date());
  const cashLabel = cash.data ? cashOnHandLabel(cash.data.on_hand) : null;

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
  const groups = groupPayoutsByDay(history.data?.items ?? [], new Date());
  const hasMore = history.data?.hasMore ?? false;
  const firstEarned = totals?.first_earned_at
    ? `Since ${new Date(totals.first_earned_at).toLocaleDateString()}`
    : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: bottomPadding }}
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

      {/* Cash on hand, not earnings. This is the number that decides whether
          the rider needs to bank today, and it is the mirror of the payout
          ledger above: money the rider took from customers and has not yet
          handed in. It is kept visually separate for exactly that reason --
          showing it inside "earnings" would read as money the platform owes. */}
      {cash.data && cashLabel ? (
        <View style={styles.section}>
          <View style={[styles.cashCard, shadow.card]}>
            <View style={styles.cashHeader}>
              <View style={styles.cashText}>
                <Text style={type.eyebrow}>Cash on hand</Text>
                <Text style={styles.cashCaption}>
                  Collected from customers, not yet handed in
                </Text>
              </View>
              <Text
                style={[
                  styles.cashValue,
                  cashLabel.tone === "warning" ? styles.cashValueWarning : null,
                ]}
              >
                {cashLabel.text}
              </Text>
            </View>
            <View style={styles.cashMeta}>
              <Text style={type.caption}>Collected {peso(cash.data.collected)}</Text>
              <Text style={type.caption}>Handed in {peso(cash.data.handed_over)}</Text>
            </View>
            {cash.data.flagged > 0 ? (
              <Text style={styles.cashFlag}>
                {peso(cash.data.flagged)} in differences is under review
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
      {pabakalTotals.count > 0 ? (
        <View style={styles.section}>
          <View style={[styles.cashCard, shadow.card]}>
            <View style={styles.cashHeader}>
              <View style={styles.cashText}>
                <Text style={type.eyebrow}>Pabakal</Text>
                <Text style={styles.cashCaption}>
                  Fees from {pabakalTotals.count} pabakal, yours to keep
                </Text>
              </View>
              <Text style={styles.cashValue}>{peso(pabakalTotals.total)}</Text>
            </View>
            <View style={styles.cashMeta}>
              <Text style={type.caption}>Today {peso(pabakalTotals.today)}</Text>
              <Text style={type.caption}>This week {peso(pabakalTotals.week)}</Text>
            </View>
          </View>
        </View>
      ) : null}
      {cash.error ? (
        <Text style={styles.cashError}>
          Cash position is unavailable right now. Your earnings are unaffected.
        </Text>
      ) : null}

      <View style={styles.section}>
        <Text style={type.eyebrow}>Each delivery</Text>

        {groups.length === 0 ? (
          <View style={[styles.empty, shadow.card]}>
            <Text style={styles.emptyTitle}>No completed deliveries yet</Text>
            <Text style={styles.emptyBody}>
              {firstEarned
                ? "Claim an order, then mark it delivered and it will show up here with the fee it paid."
                : "Earnings start appearing here after your first delivery on this device's account. Older deliveries have no recorded payout, so they are left out rather than guessed at."}
            </Text>
          </View>
        ) : (
          <View style={styles.groups}>
            {groups.map((group, groupIndex) => (
              <View
                key={group.bucket}
                style={groupIndex === 0 ? undefined : styles.groupSpaced}
              >
                {/* The day is the heading because that is the question the rider
                    is asking; the total is here because it is the other half of
                    it. */}
                <View style={styles.groupHeader}>
                  <Text style={styles.groupLabel}>{BUCKET_LABEL[group.bucket]}</Text>
                  <Text style={styles.groupTotal}>{peso(bucketTotal(group))}</Text>
                </View>
                <View style={[styles.list, shadow.card]}>
                  {group.rows.map((row, index) => (
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
                        {/* 0075. The rider is still paid either way, so this is
                            not an error state -- it says the delivery is being
                            looked into. Shown only for 'disputed': every new
                            delivery is 'pending_review', and a badge that is
                            always on tells the rider nothing. */}
                        {needsRiderAttention(row.settlement_state) ? (
                          <Text style={styles.disputedLabel}>
                            Under review — an admin is looking into this delivery
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.rowAmount}>{peso(row.amount)}</Text>
                    </View>
                  ))}
                </View>
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
  cashCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cashHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  cashText: { flex: 1, gap: 2 },
  cashCaption: { ...type.caption, color: colors.textFaint, lineHeight: 16 },
  cashValue: { ...type.heading, fontSize: 24 },
  cashValueWarning: { color: colors.warning },
  cashMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  cashFlag: { ...type.caption, color: colors.warning },
  cashError: {
    ...type.caption,
    color: colors.textFaint,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: spacing.md },
  groups: { gap: spacing.md },
  groupSpaced: { marginTop: spacing.sm },
  groupHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
  },
  groupLabel: { ...type.eyebrow, color: colors.secondary },
  groupTotal: { ...type.label, color: colors.textMuted },
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
  // Warning, not danger: the payout is already counted as the rider's and is not
  // at risk. The rider needs to know a claim is open, not that something broke.
  disputedLabel: { ...type.caption, color: colors.warning },
  footnote: {
    ...type.caption,
    color: colors.textFaint,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    lineHeight: 16,
  },
});
