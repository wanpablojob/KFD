import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { fetchRiderLocation, updatedAgo } from "../lib/rider-location";
import { openInMaps } from "../lib/maps";
import { backoffFor } from "../lib/poll";
import { colors, radius, shadow, spacing, type } from "../lib/theme";

/**
 * Where the rider is (0135), for the customer whose order is on the way. The
 * pin opens in the phone's own maps app, so no maps API is needed. Shows
 * nothing until the server has a fresh position for this customer's rider.
 */
export function RiderOnTheWay({
  reference,
  enabled,
}: {
  reference: string;
  enabled: boolean;
}) {
  const location = useQuery({
    queryKey: ["riderLocation", reference],
    queryFn: () => fetchRiderLocation(reference),
    enabled: enabled && !!reference,
    refetchInterval: (query) => backoffFor(30_000, query.state.fetchFailureCount),
  });
  const at = location.data;
  if (!enabled || !at) return null;

  return (
    <View style={[styles.card, shadow.card]}>
      <View style={styles.icon}>
        <Ionicons name="bicycle" size={22} color={colors.textInverse} />
      </View>
      <View style={styles.text}>
        <Text style={type.heading}>Your rider is on the way</Text>
        <Text style={type.caption}>
          Location updated {updatedAgo(at.updatedAt, location.dataUpdatedAt)}
        </Text>
      </View>
      <Pressable
        onPress={() => void openInMaps(`${at.latitude},${at.longitude}`)}
        accessibilityRole="button"
        accessibilityLabel="See your rider on the map"
        style={styles.button}
      >
        <Ionicons name="map-outline" size={16} color={colors.primary} />
        <Text style={styles.buttonLabel}>Map</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: 2 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  buttonLabel: { ...type.label, color: colors.primary },
});
