import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, usePathname, useRouter } from "expo-router";
import { CartProvider, useCart } from "../../lib/cart-context";
import { CartPill } from "../../components/CartPill";
import { FloatingTabBar, type FloatingTab } from "../../components/FloatingTabBar";
import { TabBarInsetProvider } from "../../components/TabBarInset";
import { TAB_ICONS } from "../../components/tab-icons";
import { cartPillInset, resolveTabIndex } from "../../lib/tab-bar";
import { colors } from "../../lib/theme";

/**
 * Customer surface (browse -> order -> track), guarded as a group in the root
 * layout (role === "customer").
 *
 * The cart lives only inside this navigator: it is cleared on sign-out by the
 * per-user remount of SessionProvider.
 *
 * Foodpanda-style chrome lives here rather than in each screen -- the floating
 * tab bar and the cart pill above it -- so the storefront screens stay about
 * their own content.
 */
export default function CustomerLayout() {
  return (
    <CartProvider>
      <CustomerShell />
    </CartProvider>
  );
}

const TABS: (FloatingTab & { route: string })[] = [
  { key: "home", route: "/customer", label: "Home", ...TAB_ICONS.home },
  { key: "orders", route: "/customer/orders", label: "Orders", ...TAB_ICONS.orders },
  {
    key: "account",
    route: "/customer/account",
    label: "Account",
    ...TAB_ICONS.account,
  },
];
const ROUTES = TABS.map((tab) => tab.route);

/** The cart pins its own checkout footer, which the bar would sit on top of. */
const CART_ROUTE = "/customer/cart";

function CustomerShell() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { count, subtotal } = useCart();

  const onCart = pathname === CART_ROUTE;
  const pillVisible = count > 0 && !onCart;
  const items = `${count} item${count === 1 ? "" : "s"}`;

  // The cart count rides on the Home tab, where the storefront is.
  const tabs = TABS.map((tab) =>
    tab.key === "home" && count > 0
      ? { ...tab, badge: count, accessibilityLabel: `Home, ${items} in cart` }
      : tab
  );

  return (
    <View style={styles.root}>
      <TabBarInsetProvider
        bottomInset={insets.bottom}
        hasBar={!onCart}
        above={cartPillInset(pillVisible)}
      >
        <Stack screenOptions={{ headerShown: false, animation: "fade_from_bottom" }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="restaurant" />
          <Stack.Screen name="cart" />
          <Stack.Screen name="orders" />
          <Stack.Screen name="account" />
        </Stack>
      </TabBarInsetProvider>

      <CartPill
        visible={pillVisible}
        count={count}
        subtotal={subtotal}
        onPress={() => router.push(CART_ROUTE as never)}
      />
      <FloatingTabBar
        tabs={tabs}
        selectedIndex={resolveTabIndex(pathname, ROUTES)}
        onChange={(index) => router.navigate(TABS[index].route as never)}
        hidden={onCart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
