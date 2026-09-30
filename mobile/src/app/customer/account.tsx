import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../../lib/session-context";
import { signOut } from "../../lib/auth";
import { colors, radius, shadow, spacing, type } from "../../lib/theme";

/**
 * Customer profile: who you are signed in as, what you have ordered, and the
 * way out. The session user is the source of truth for the email -- there is no
 * customers table to drift from.
 */
export default function CustomerAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useSession();

  const email = user?.email ?? "";
  const name =
    typeof user?.user_metadata?.name === "string" && user.user_metadata.name
      ? user.user_metadata.name
      : email.split("@")[0] || "Customer";

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.list, { paddingTop: spacing.lg + insets.top }]}
    >
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={type.title}>{name}</Text>
        {email ? <Text style={type.caption}>{email}</Text> : null}
        <View style={styles.rolePill}>
          <Text style={styles.roleText}>CUSTOMER</Text>
        </View>
      </View>

      <View style={[styles.card, shadow.card]}>
        <Row
          label="Your orders"
          hint="Track a past or active order"
          onPress={() => router.push("/customer/orders" as never)}
        />
        <View style={styles.divider} />
        <Row
          label="Track by reference"
          hint="Track any order with its KFD code"
          onPress={() => router.push("/track" as never)}
        />
      </View>

      <Pressable
        style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
        onPress={() => void signOut()}
        accessibilityRole="button"
      >
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>

      <Text style={styles.version}>Kabankalan Food Delivery</Text>
    </ScrollView>
  );
}

function Row({
  label,
  hint,
  onPress,
}: {
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <Text style={styles.rowChevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  header: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.lg },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  avatarText: { fontSize: 30, fontWeight: "800", color: colors.gold },
  rolePill: {
    marginTop: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  roleText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.primary,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  rowPressed: { opacity: 0.6 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { ...type.heading, fontSize: 15 },
  rowHint: { ...type.caption, color: colors.textFaint },
  rowChevron: { fontSize: 24, color: colors.textFaint },
  divider: { height: 1, backgroundColor: colors.border },
  signOut: {
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  signOutPressed: { backgroundColor: colors.dangerSoft },
  signOutLabel: { fontSize: 15, fontWeight: "700", color: colors.danger },
  version: { ...type.caption, color: colors.textFaint, textAlign: "center" },
});
