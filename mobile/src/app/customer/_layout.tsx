import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, usePathname, useRouter } from "expo-router";
import { CartProvider, useCart } from "../../lib/cart-context";
import { useSession } from "../../lib/session-context";
import { FloatingTabBar, type FloatingTab } from "../../components/FloatingTabBar";
import { TabBarInsetProvider } from "../../components/TabBarInset";
import { TAB_ICONS } from "../../components/tab-icons";
import { resolveTabIndex } from "../../lib/tab-bar";
import { colors } from "../../lib/theme";

/**
 * Customer surface, guarded as a group in the root layout (role === "customer").
 *
 * The cart lives only inside this navigator: it is cleared on sign-out by the
 * per-user remount of SessionProvider, and persisted per user so the OS killing
 * the app does not empty it.
 *
 * Five tabs: Home, Shops, Pabakal, Cart (with the item count) and Account. The chrome lives here so the screens stay about their content.
 */
export default function CustomerLayout() {
  const { user } = useSession();
  // The root navigator only mounts this group for a signed-in customer, so this
  // is a type guard rather than a state the customer can reach.
  if (!user) return null;
  return (
    <CartProvider userId={user.id}>
      <CustomerShell />
    </CartProvider>
  );
}

const TABS: (FloatingTab & { route: string })[] = [
  { key: "home", route: "/customer", label: "Home", ...TAB_ICONS.home },
  { key: "shops", route: "/customer/shops", label: "Shops", ...TAB_ICONS.shops },
  {
    key: "pabakal",
    route: "/customer/pabakal",
    label: "Pabakal",
    ...TAB_ICONS.pabakal,
  },
  { key: "cart", route: "/customer/cart", label: "Cart", ...TAB_ICONS.cart },
  {
    key: "account",
    route: "/customer/account",
    label: "Account",
    ...TAB_ICONS.account,
  },
];
const ROUTES = TABS.map((tab) => tab.route);

/**
 * Screens that are not tabs but belong to one. Without this, the prefix rule
 * would light Home for a restaurant page opened from Shops.
 */
const PARENT_TAB: Record<string, number> = {
  "/customer/restaurant": 1,
  "/customer/addresses": 4,
  // Orders is no longer a tab; it opens from Account and after checkout.
  "/customer/orders": 4,
};

function CustomerShell() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { count } = useCart();

  const tabs = TABS.map((tab) =>
    tab.key === "cart" && count > 0
      ? {
          ...tab,
          badge: count,
          accessibilityLabel: `Cart, ${count} item${count === 1 ? "" : "s"}`,
        }
      : tab
  );

  return (
    <View style={styles.root}>
      <TabBarInsetProvider bottomInset={insets.bottom}>
        <Stack screenOptions={{ headerShown: false, animation: "fade_from_bottom" }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="shops" />
          <Stack.Screen name="restaurant" />
          <Stack.Screen name="cart" />
          <Stack.Screen name="orders" />
          <Stack.Screen name="pabakal" />
          <Stack.Screen name="account" />
          <Stack.Screen name="addresses" />
        </Stack>
      </TabBarInsetProvider>

      <FloatingTabBar
        tabs={tabs}
        selectedIndex={PARENT_TAB[pathname] ?? resolveTabIndex(pathname, ROUTES)}
        onChange={(index) => router.navigate(TABS[index].route as never)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
