import Ionicons from "@expo/vector-icons/Ionicons";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { backoffFor } from "../lib/poll";
import { fetchPabakalRider, PABAKAL_STATUS_LABEL, type Pabakal } from "../lib/pabakal";
import { RiderOnTheWay } from "./RiderOnTheWay";
import { colors, radius, spacing, type } from "../lib/theme";

/** The progress bar on a pabakal; cancelled has none. */
const STEPS: Pabakal["status"][] = ["open", "accepted", "delivering", "delivered"];

const STATUS_TONE: Record<Pabakal["status"], { fg: string; bg: string }> = {
  open: { fg: colors.warning, bg: colors.goldSoft },
  accepted: { fg: colors.primary, bg: colors.primarySoft },
  delivering: { fg: colors.primary, bg: colors.primarySoft },
  delivered: { fg: colors.success, bg: colors.successSoft },
  cancelled: { fg: colors.textMuted, bg: colors.surface },
};

export function PabakalStatusPill({ status }: { status: Pabakal["status"] }) {
  const tone = STATUS_TONE[status];
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.pillText, { color: tone.fg }]}>
        {PABAKAL_STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

export function PabakalProgress({ status }: { status: Pabakal["status"] }) {
  const step = STEPS.indexOf(status);
  if (step < 0) return null;
  return (
    <View style={styles.progress} accessibilityLabel={PABAKAL_STATUS_LABEL[status]}>
      {STEPS.map((s, i) => (
        <View key={s} style={[styles.progressBar, i <= step && styles.progressOn]} />
      ))}
    </View>
  );
}

/** Who has the pabakal, a call button, and where they are once it is bought. */
export function PabakalRider({ p }: { p: Pabakal }) {
  const rider = useQuery({
    queryKey: ["pabakalRider", p.id],
    queryFn: () => fetchPabakalRider(p.id),
    refetchInterval: (query) => backoffFor(30_000, query.state.fetchFailureCount),
  });
  return (
    <>
      {rider.data ? (
        <View style={styles.rowBetween}>
          <View style={styles.row}>
            <Ionicons name="bicycle-outline" size={16} color={colors.secondary} />
            <Text style={type.body}>Rider {rider.data.name}</Text>
          </View>
          {rider.data.phone ? (
            <Pressable
              onPress={() => void Linking.openURL(`tel:${rider.data?.phone}`)}
              accessibilityRole="button"
              accessibilityLabel={`Call rider ${rider.data.name}`}
              hitSlop={8}
              style={styles.row}
            >
              <Ionicons name="call-outline" size={16} color={colors.primary} />
              <Text style={styles.link}>Call</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <RiderOnTheWay reference={p.reference} enabled={p.status === "delivering"} />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  link: { ...type.label, color: colors.primary },
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  pillText: { fontSize: 12, fontWeight: "800" },
  progress: { flexDirection: "row", gap: 4 },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surface },
  progressOn: { backgroundColor: colors.primary },
});
