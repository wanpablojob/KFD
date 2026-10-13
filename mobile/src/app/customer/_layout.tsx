import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, usePathname, useRouter } from "expo-router";
import { CartProvider, useCart } from "../../lib/cart-context";
import { GlassBottomNav, type GlassTab } from "../../components/glass-bottom-nav";
import { colors, radius, shadow, spacing } from "../../lib/theme";

/**
 * Customer surface (browse -> order -> track), guarded as a group in the root
 * layout (role === "customer").
 *
 * The cart lives only inside this navigator: it is cleared on sign-out by the
 * per-user remount of SessionProvider.
 *
 * Foodpanda-style chrome lives here rather than in each screen -- a top brand
 * bar and a bottom tab bar -- so the three storefront screens stay about their
 * own content.
 */
export default function CustomerLayout() {
  return (
    <CartProvider>
      <CustomerShell />
    </CartProvider>
  );
}

function CustomerShell() {
  const pathname = usePathname();

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Stack screenOptions={{ headerShown: false, animation: "fade_from_bottom" }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="restaurant" />
          <Stack.Screen name="cart" />
          <Stack.Screen name="orders" />
          <Stack.Screen name="account" />
        </Stack>
      </View>
      <BottomNav pathname={pathname} />
    </View>
  );
}

const TABS: GlassTab[] = [
  { route: "/customer", label: "Home", glyph: "⌂", iconLabel: "Home" },
  { route: "/customer/orders", label: "Orders", glyph: "≡", iconLabel: "Orders" },
  { route: "/customer/account", label: "Account", glyph: "◍", iconLabel: "Account" },
];

function BottomNav({ pathname }: { pathname: string }) {
  const router = useRouter();
  const { count, subtotal } = useCart();
  const hasCart = count > 0;

  // The cart rides in the glass bar's trailing slot rather than as a floating
  // overlay, so it is inside the blur and picks up the same treatment as the
  // tabs instead of sitting on a card-coloured strip that the blur would clash
  // with. When there is no cart the tabs centre, matching the rider bar.
  const cartButton = hasCart ? (
    <Pressable
      style={({ pressed }) => [
        styles.viewCart,
        shadow.card,
        pressed && styles.viewCartPressed,
      ]}
      onPress={() => router.push("/customer/cart" as never)}
      accessibilityRole="button"
      accessibilityLabel={`View cart, ${count} item${count === 1 ? "" : "s"}, ${subtotal.toFixed(2)} pesos`}
    >
      <Text style={styles.viewCartCount}>
        {count} item{count === 1 ? "" : "s"}
      </Text>
      <Text style={styles.viewCartLabel}>View cart</Text>
      <Text style={styles.viewCartTotal}>₱{subtotal.toFixed(2)}</Text>
    </Pressable>
  ) : undefined;

  return (
    <SafeAreaView style={styles.nav} edges={["bottom"]}>
      <GlassBottomNav
        pathname={pathname}
        tabs={TABS}
        onNavigate={(route) => router.navigate(route as never)}
        leading={cartButton}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  // Transparent, so the glass bar's blur and scrim supply the surface. A
  // background here would sit behind the blur and cancel it out.
  nav: { backgroundColor: "transparent" },
  viewCart: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  viewCartPressed: { backgroundColor: colors.primaryDark },
  viewCartCount: { fontSize: 12, fontWeight: "600", color: colors.primarySoft },
  viewCartLabel: { fontSize: 13, fontWeight: "800", color: colors.textInverse },
  viewCartTotal: { fontSize: 14, fontWeight: "800", color: colors.gold },
});
