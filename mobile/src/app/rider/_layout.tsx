import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, usePathname, useRouter } from "expo-router";
import { FloatingTabBar, type FloatingTab } from "../../components/FloatingTabBar";
import { TabBarInsetProvider } from "../../components/TabBarInset";
import { TAB_ICONS } from "../../components/tab-icons";
import { colors } from "../../lib/theme";
import { autoEnablePushOnce, ensureNotificationChannels } from "../../lib/push";
import { useRiderOffers } from "../../lib/hooks";
import { countClaimableOffers } from "../../lib/offer-claimable";
import { resolveTabIndex } from "../../lib/tab-bar";
import { useShareRiderLocation } from "../../lib/rider-location";

/**
 * Rider surface (deliveries -> earnings -> profile), guarded as a group in the
 * root layout (role === "rider").
 *
 * Mirrors the customer chrome: a Stack for the tabs plus the same floating tab
 * bar, so the rider surface feels like the same app as the storefront. Riders
 * have no cart, so nothing floats above the bar.
 */
export default function RiderLayout() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  // The dispatch offer channel has to exist before an offer can arrive, and a
  // rider who registered before it shipped still has no such channel. Created on
  // mount rather than on the push toggle, which they may never revisit.
  // Offers last five minutes and a rider is told about them by push, so the
  // rider is asked once, on first open, like a merchant -- not left to find
  // the switch in Profile. Nobody had, so no rider phone was ever registered.
  useEffect(() => {
    void ensureNotificationChannels().then(autoEnablePushOnce);
  }, []);
  // The customer sees the rider on the way (0135). The server keeps a position
  // only while the rider has a job, so this is harmless between jobs.
  useShareRiderLocation(true);

  return (
    <View style={styles.root}>
      <TabBarInsetProvider bottomInset={insets.bottom}>
        <Stack screenOptions={{ headerShown: false, animation: "fade_from_bottom" }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="offers" />
          <Stack.Screen name="earnings" />
          <Stack.Screen name="profile" />
        </Stack>
      </TabBarInsetProvider>
      <RiderTabBar pathname={pathname} />
    </View>
  );
}

// Available is first because it is the queue a rider opens the app to work.
// Deliveries is what they already accepted.
const TABS: (FloatingTab & { route: string })[] = [
  {
    key: "available",
    route: "/rider/offers",
    label: "Available",
    ...TAB_ICONS.available,
  },
  { key: "deliveries", route: "/rider", label: "Deliveries", ...TAB_ICONS.deliveries },
  {
    key: "earnings",
    route: "/rider/earnings",
    label: "Earnings",
    ...TAB_ICONS.earnings,
  },
  { key: "profile", route: "/rider/profile", label: "Profile", ...TAB_ICONS.profile },
];
const ROUTES = TABS.map((tab) => tab.route);

function RiderTabBar({ pathname }: { pathname: string }) {
  const router = useRouter();

  /**
   * The offers query lives here, not only on the Available screen, because the
   * Stack unmounts inactive tabs: while the rider is on Earnings, the offers
   * screen is gone and so is its poll, which is exactly when a push arrives.
   * Both observers use the same `["riderOffers"]` key, so this is one request
   * and one 10s poll, not two -- and it also refetches on foreground now that
   * focusManager is wired.
   */
  const { data: offers } = useRiderOffers();

  // One shared tick, the same one the offer cards use, so the badge and the
  // countdowns agree on what has expired.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const claimable = countClaimableOffers(offers ?? [], now);
  const tabs = TABS.map((tab) =>
    tab.key === "available" ? { ...tab, badge: claimable } : tab
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
