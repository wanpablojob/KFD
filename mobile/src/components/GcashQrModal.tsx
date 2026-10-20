import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "../lib/theme";

/**
 * Full-screen GCash QR, sized to be scanned from another phone.
 *
 * The rider opens this at the door instead of switching to the GCash app, so
 * the surface is deliberately plain: white behind the code, no card chrome
 * competing with it, and one way out.
 */
export function GcashQrModal({
  visible,
  url,
  name,
  onClose,
}: {
  visible: boolean;
  url: string | null;
  name: string | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!url) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.root,
          {
            paddingTop: insets.top + spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>GCASH</Text>
          <Text style={styles.name}>{name?.trim() || "Scan to pay"}</Text>
        </View>

        <View style={styles.frame}>
          <Image
            source={{ uri: url }}
            style={styles.qr}
            resizeMode="contain"
            accessibilityLabel="GCash QR code"
          />
        </View>

        <Text style={styles.hint}>Let the customer scan this with GCash.</Text>

        <Pressable
          style={styles.done}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close GCash QR"
        >
          <Text style={styles.doneLabel}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Pure white, not the cream page: the code needs the contrast.
  root: {
    flex: 1,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  header: { alignItems: "center", gap: spacing.xs },
  eyebrow: { ...type.eyebrow, color: colors.secondary },
  name: { ...type.title, textAlign: "center" },
  frame: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
  qr: {
    width: "100%",
    maxWidth: 340,
    aspectRatio: 1,
    backgroundColor: colors.card,
  },
  hint: { ...type.body, color: colors.textMuted, textAlign: "center" },
  done: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
  },
  doneLabel: { ...type.label, color: colors.textInverse, fontWeight: "700" },
});
