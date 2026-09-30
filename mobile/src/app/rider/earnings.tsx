import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRiderProfile } from "../../lib/hooks";
import { useSession } from "../../lib/session-context";
import { colors, radius, shadow, spacing, type } from "../../lib/theme";

/**
 * Earnings tab. The riders row already carries the lifetime totals, so this is
 * a read-only summary of them -- no extra queries, no new RPCs.
 */
export default function RiderEarningsRoute() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { data: profile, isLoading, error } = useRiderProfile(user?.id ?? "");

  if (isLoading) {
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

  if (!profile) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={styles.error}>No rider profile is linked to this account.</Text>
        <StatusBar style="dark" />
      </View>
    );
  }

  const perDelivery =
    profile.deliveries > 0 ? profile.earnings / profile.deliveries : 0;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: spacing.lg + insets.top }]}>
        <Text style={styles.eyebrow}>Earnings</Text>
        <Text style={styles.total}>₱{Number(profile.earnings).toFixed(2)}</Text>
        <Text style={styles.subtitle}>Lifetime total</Text>
      </View>

      <View style={styles.cards}>
        <View style={styles.card}>
          <Text style={styles.cardValue}>{profile.deliveries}</Text>
          <Text style={styles.cardLabel}>Deliveries</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardValue}>{Number(profile.rating).toFixed(1)}</Text>
          <Text style={styles.cardLabel}>Rating</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardValue}>₱{perDelivery.toFixed(2)}</Text>
          <Text style={styles.cardLabel}>Per delivery</Text>
        </View>
      </View>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  eyebrow: { ...type.eyebrow, color: colors.secondary },
  total: { ...type.display, fontSize: 40, color: colors.primary },
  subtitle: { ...type.caption, color: colors.textMuted },
  cards: { paddingHorizontal: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadow.card,
  },
  cardValue: { ...type.display, fontSize: 26, color: colors.text },
  cardLabel: { ...type.caption, color: colors.textMuted },
  error: { ...type.body, color: colors.danger },
});
