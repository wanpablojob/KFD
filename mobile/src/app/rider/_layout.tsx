import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, usePathname, useRouter } from "expo-router";
import { GlassBottomNav, type GlassTab } from "../../components/glass-bottom-nav";
import { colors } from "../../lib/theme";
import { ensureNotificationChannels } from "../../lib/push";
import { useRiderOffers } from "../../lib/hooks";
import { countClaimableOffers } from "../../lib/offer-claimable";

/**
 * Rider surface (deliveries -> earnings -> profile), guarded as a group in the
 * root layout (role === "rider").
 *
 * Mirrors the customer chrome: a Stack for the tabs plus a centered bottom nav
 * so the rider surface feels like the same app as the storefront. Riders have
 * no cart, so the tab row is always centered.
 */
export default function RiderLayout() {
  const pathname = usePathname();

  // The dispatch offer channel has to exist before an offer can arrive, and a
  // rider who registered before it shipped still has no such channel. Created on
  // mount rather than on the push toggle, which they may never revisit.
  useEffect(() => {
    void ensureNotificationChannels();
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Stack screenOptions={{ headerShown: false, animation: "fade_from_bottom" }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="offers" />
          <Stack.Screen name="earnings" />
          <Stack.Screen name="profile" />
        </Stack>
      </View>
      <BottomNav pathname={pathname} />
    </View>
  );
}

/**
 * The tab row is glyphs, and a screen reader reads a glyph's unicode point
 * rather than what it stands for -- "black diamond containing white small
 * diamond" for the offers queue. Each tab carries the label it stands for so a
 * screen reader is told which of the two things to read as the control's name.
 * The shape lives in GlassTab; only the rider's set of routes is declared here.
 */
const TABS: GlassTab[] = [
  // Available is first because it is the queue a rider opens the app to work.
  // Deliveries is what they already accepted.
  {
    route: "/rider/offers",
    label: "Available",
    glyph: "◈",
    iconLabel: "Offers",
  },
  {
    route: "/rider",
    label: "Deliveries",
    glyph: "≡",
    iconLabel: "Deliveries",
  },
  {
    route: "/rider/earnings",
    label: "Earnings",
    glyph: "₱",
    iconLabel: "Earnings",
  },
  {
    route: "/rider/profile",
    label: "Profile",
    glyph: "◍",
    iconLabel: "Profile",
  },
];

function BottomNav({ pathname }: { pathname: string }) {
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
    tab.route === "/rider/offers" ? { ...tab, badge: claimable } : tab
  );

  return (
    <SafeAreaView style={styles.nav} edges={["bottom"]}>
      <GlassBottomNav
        pathname={pathname}
        tabs={tabs}
        onNavigate={(route) => router.navigate(route as never)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  // Transparent, so the glass bar's own blur and scrim supply the surface. A
  // background here would sit behind the blur and cancel it out.
  nav: { backgroundColor: "transparent" },
});
