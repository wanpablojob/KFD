import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CART_PILL_METRICS, TAB_BAR_METRICS, tabBarBottom } from "../lib/tab-bar";
import { colors, spacing } from "../lib/theme";
import { GlassSurface, useGlassPreferences, useKeyboardVisible } from "./GlassSurface";

/**
 * The customer's "View cart" pill, floating on its own just above the tab bar.
 *
 * It is not inside the capsule: a cart summary is a different kind of control
 * from a tab, and squeezing it into the bar is what made the old bar uneven.
 * It shares the bar's glass so the two read as one set of floating chrome.
 *
 * The count and total it shows are the last non-empty ones, so while it animates
 * out after the cart empties it does not flash "0 items, ₱0.00".
 */
export function CartPill({
  visible,
  count,
  subtotal,
  onPress,
}: {
  visible: boolean;
  count: number;
  subtotal: number;
  onPress: () => void;
}) {
  const insets = useSafeAreaInsets();
  const prefs = useGlassPreferences();
  const keyboard = useKeyboardVisible();
  const shown = visible && !keyboard;

  const [progress] = useState(() => new Animated.Value(shown ? 1 : 0));
  const [snapshot, setSnapshot] = useState({ count, subtotal });
  if (count > 0 && (snapshot.count !== count || snapshot.subtotal !== subtotal)) {
    setSnapshot({ count, subtotal });
  }

  useEffect(() => {
    Animated.timing(progress, {
      toValue: shown ? 1 : 0,
      duration: prefs.reduceMotion ? 100 : 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [shown, progress, prefs.reduceMotion]);

  const items = `${snapshot.count} item${snapshot.count === 1 ? "" : "s"}`;
  const total = `₱${snapshot.subtotal.toFixed(2)}`;

  return (
    <Animated.View
      pointerEvents={shown ? "box-none" : "none"}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? "auto" : "no-hide-descendants"}
      style={[
        styles.layer,
        {
          bottom:
            tabBarBottom(insets.bottom) +
            TAB_BAR_METRICS.height +
            CART_PILL_METRICS.gap,
          opacity: progress,
          transform: prefs.reduceMotion
            ? []
            : [
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [16, 0],
                  }),
                },
                {
                  scale: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.96, 1],
                  }),
                },
              ],
        },
      ]}
    >
      <GlassSurface prefs={prefs} style={StyleSheet.absoluteFill} />
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`View cart, ${items}, ${snapshot.subtotal.toFixed(2)} pesos`}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={styles.count}>
          <Ionicons name="bag-handle" size={18} color={colors.primary} />
          <Text style={styles.countText} maxFontSizeMultiplier={1.2} numberOfLines={1}>
            {items}
          </Text>
        </View>
        <Text style={styles.label} maxFontSizeMultiplier={1.2} numberOfLines={1}>
          View cart
        </Text>
        <Text style={styles.total} maxFontSizeMultiplier={1.2} numberOfLines={1}>
          {total}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    left: TAB_BAR_METRICS.horizontalMargin,
    right: TAB_BAR_METRICS.horizontalMargin,
    height: CART_PILL_METRICS.height,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  pressed: { opacity: 0.7 },
  count: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexShrink: 1 },
  countText: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  label: { fontSize: 15, fontWeight: "800", color: colors.primary },
  total: { fontSize: 15, fontWeight: "800", color: colors.text },
});
