import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, usePathname, useRouter } from "expo-router";
import { FloatingTabBar, type FloatingTab } from "../../components/FloatingTabBar";
import { TabBarInsetProvider } from "../../components/TabBarInset";
import { TAB_ICONS } from "../../components/tab-icons";
import { colors } from "../../lib/theme";
import { ensureNotificationChannels } from "../../lib/push";
import { useMerchantOrders } from "../../lib/merchant";
import { resolveTabIndex } from "../../lib/tab-bar";

/**
 * Merchant surface (orders -> menu -> sales -> account), guarded as a group in
 * the root layout (role === "merchant"). Same chrome as the rider and
 * customer surfaces so all three read as one app.
 */
export default function MerchantLayout() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  // The orders channel must exist before an alert arrives.
  useEffect(() => {
    void ensureNotificationChannels();
  }, []);

  return (
    <View style={styles.root}>
      <TabBarInsetProvider bottomInset={insets.bottom}>
        <Stack screenOptions={{ headerShown: false, animation: "fade_from_bottom" }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="menu" />
          <Stack.Screen name="sales" />
          <Stack.Screen name="account" />
        </Stack>
      </TabBarInsetProvider>
      <MerchantTabBar pathname={pathname} />
    </View>
  );
}

const TABS: (FloatingTab & { route: string })[] = [
  { key: "orders", route: "/merchant", label: "Orders", ...TAB_ICONS.kitchen },
  { key: "menu", route: "/merchant/menu", label: "Menu", ...TAB_ICONS.menu },
  { key: "sales", route: "/merchant/sales", label: "Sales", ...TAB_ICONS.sales },
  {
    key: "account",
    route: "/merchant/account",
    label: "Account",
    ...TAB_ICONS.account,
  },
];
const ROUTES = TABS.map((tab) => tab.route);

function MerchantTabBar({ pathname }: { pathname: string }) {
  const router = useRouter();
  // Lives here so the waiting count stays live on every tab; the Orders screen
  // shares the same query key, so this is one request, not two.
  const { data: orders } = useMerchantOrders();
  const waiting = (orders ?? []).filter((o) => o.status === "pending").length;
  const tabs = TABS.map((tab) =>
    tab.key === "orders" ? { ...tab, badge: waiting } : tab
  );

  return (
    <FloatingTabBar
      tabs={tabs}
      selectedIndex={resolveTabIndex(pathname, ROUTES)}
      onChange={(index) => router.navigate(TABS[index].route as never)}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
