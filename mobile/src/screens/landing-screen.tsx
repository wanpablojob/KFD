import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";

export type LandingAction = "track" | "rider";

/**
 * Signed-out landing. The customer side is public -- track_order() is granted
 * to anon, matching the web's reference-tracking page -- so the two entry
 * points are explicit: track an existing order (no login) or sign in as a
 * rider. A customer should never be asked for credentials they were never
 * provisioned with.
 */
export function LandingScreen({
  onAction,
}: {
  onAction: (action: LandingAction) => void;
}) {
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>KFD</Text>
        <Text style={styles.subtitle}>
          Kabankalan City Proper food delivery
        </Text>

        <Pressable style={styles.primary} onPress={() => onAction("track")}>
          <Text style={styles.primaryLabel}>Track an order</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => onAction("rider")}>
          <Text style={styles.secondaryLabel}>Rider sign in</Text>
        </Pressable>
      </View>
      <StatusBar style="dark" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
  },
  inner: { padding: 24, gap: 12 },
  title: { fontSize: 32, fontWeight: "800", color: "#111", textAlign: "center" },
  subtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    marginBottom: 16,
  },
  primary: {
    backgroundColor: "#111",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  primaryLabel: { fontSize: 16, fontWeight: "700", color: "#fff" },
  secondary: {
    borderWidth: 1,
    borderColor: "#d1d1d1",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryLabel: { fontSize: 16, fontWeight: "600", color: "#111" },
});