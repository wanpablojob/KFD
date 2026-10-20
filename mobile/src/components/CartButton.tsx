import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useCart } from "../lib/cart-context";
import { colors, radius } from "../lib/theme";

/**
 * The cart in a surface header: always visible, with a count when it has items.
 *
 * The floating "View cart" pill only appears once something is in the cart, so
 * before this button the only way to reach an empty cart was to add an item
 * first. It is a header control, not a tab: the pill still owns the checkout
 * summary, and this is the thing a customer looks for at the top of the screen.
 */
export function CartButton({ tint = colors.primary }: { tint?: string }) {
  const router = useRouter();
  const { count } = useCart();
  const items = `${count} item${count === 1 ? "" : "s"}`;

  return (
    <Pressable
      onPress={() => router.push("/customer/cart")}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Cart, ${items}` : "Cart, empty"}
      style={styles.button}
    >
      <Ionicons name="cart-outline" size={24} color={tint} />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
            {count > 9 ? "9+" : count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: 4 },
  badge: {
    position: "absolute",
    top: 0,
    right: -2,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: colors.textInverse },
});
