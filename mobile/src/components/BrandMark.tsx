import {
  Image,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, type } from "../lib/theme";

/**
 * The Meriendash logo and name, at the top of each role's screens, so the
 * customer, rider and merchant apps all say whose app this is.
 */
export function BrandMark({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[styles.row, style]}
      accessibilityRole="header"
      accessibilityLabel="Meriendash"
    >
      <Image source={require("../../assets/rider-logo.png")} style={styles.logo} />
      <Text style={styles.name}>MERIENDASH</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  logo: { width: 26, height: 26, borderRadius: 6 },
  name: { ...type.eyebrow, color: colors.secondary, letterSpacing: 1.5 },
});
