import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import * as Notifications from "expo-notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, usePathname, useRouter } from "expo-router";
import { FloatingTabBar, type FloatingTab } from "../../components/FloatingTabBar";
import { TabBarInsetProvider } from "../../components/TabBarInset";
import { TAB_ICONS } from "../../components/tab-icons";
import { colors } from "../../lib/theme";
import { enablePush, ensureNotificationChannels, getPushStatus } from "../../lib/push";
import { supabase } from "../../lib/supabase";
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

  useMerchantAlerts();

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

/**
 * New-order alerts for the kitchen.
 *
 * The server pushes every new order to the restaurant's merchants (the
 * customer app announces it to /api/orders/notify), but only to phones that
 * registered. A merchant used to have to find the toggle in Account first, so
 * a new merchant heard nothing. Now the first visit registers this phone,
 * asking for permission once; the toggle in Account still turns it off, and a
 * phone whose owner declined is not asked again by the OS.
 *
 * While the app is open, an arriving alert refreshes Orders at once instead
 * of waiting for the 15s poll.
 */
function useMerchantAlerts() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    void (async () => {
      await ensureNotificationChannels();
      const status = await getPushStatus();
      if (!active || status.registered) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (active && session?.access_token) {
        await enablePush(session.access_token).catch(() => {});
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ["merchantOrders"] });
    });
    return () => subscription.remove();
  }, [queryClient]);
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
