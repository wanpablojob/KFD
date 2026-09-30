import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, usePathname, useRouter } from "expo-router";
import { CartProvider, useCart } from "../../lib/cart-context";
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

interface Tab {
  route: string;
  label: string;
  glyph: string;
}

const TABS: Tab[] = [
  { route: "/customer", label: "Home", glyph: "⌂" },
  { route: "/customer/orders", label: "Orders", glyph: "≡" },
  { route: "/customer/account", label: "Account", glyph: "◍" },
];

function BottomNav({ pathname }: { pathname: string }) {
  const router = useRouter();
  const { count, subtotal } = useCart();
  const hasCart = count > 0;
  return (
    <View style={styles.navWrap}>
      <SafeAreaView
        style={[styles.nav, hasCart ? styles.navWithCart : styles.navCentered]}
        edges={["bottom"]}
      >
        <View
          style={[styles.tabsWrapper, hasCart ? styles.tabsLeft : styles.tabsCentered]}
        >
          {TABS.map((tab) => {
            const active =
              tab.route === "/customer"
                ? pathname === "/customer" || pathname === "/customer/"
                : pathname.startsWith(tab.route);
            return (
              <Pressable
                key={tab.route}
                style={styles.tab}
                onPress={() => router.push(tab.route as never)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <View style={styles.tabGlyphWrap}>
                  <Text style={[styles.tabGlyph, active && styles.tabGlyphActive]}>
                    {tab.glyph}
                  </Text>
                  {tab.route === "/customer" && count > 0 ? (
                    <View style={styles.cartBadge}>
                      <Text style={styles.cartBadgeText}>{count}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {hasCart ? (
          <Pressable
            style={({ pressed }) => [
              styles.viewCart,
              shadow.card,
              pressed && styles.viewCartPressed,
            ]}
            onPress={() => router.push("/customer/cart" as never)}
          >
            <Text style={styles.viewCartCount}>
              {count} item{count === 1 ? "" : "s"}
            </Text>
            <Text style={styles.viewCartLabel}>View cart</Text>
            <Text style={styles.viewCartTotal}>₱{subtotal.toFixed(2)}</Text>
          </Pressable>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  navWrap: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.card,
  },
  navCentered: { justifyContent: "center" },
  navWithCart: { justifyContent: "space-between" },
  tabsWrapper: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
  },
  tabsCentered: { justifyContent: "center" },
  tabsLeft: { justifyContent: "flex-start" },
  tab: {
    alignItems: "center",
    gap: 2,
    paddingHorizontal: spacing.md,
    minWidth: 56,
  },
  tabGlyphWrap: { position: "relative" },
  tabGlyph: { fontSize: 20, color: colors.textFaint },
  tabGlyphActive: { color: colors.primary },
  tabLabel: { fontSize: 11, fontWeight: "600", color: colors.textFaint },
  tabLabelActive: { color: colors.primary },
  cartBadge: {
    position: "absolute",
    top: -4,
    right: -10,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadgeText: { fontSize: 10, fontWeight: "800", color: colors.textInverse },
  navSpacer: { width: 48 },
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
