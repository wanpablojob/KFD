import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, usePathname, useRouter } from "expo-router";
import { colors, spacing, type } from "../../lib/theme";
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

interface Tab {
  route: string;
  label: string;
  glyph: string;
  /**
   * Spoken name of the glyph.
   *
   * The tab row is glyphs, and a screen reader reads a glyph's unicode point
   * rather than what it stands for -- "black diamond containing white small
   * diamond" for the offers queue. The label is already in the tree next to the
   * glyph, but a label alone does not tell a screen reader which of the two
   * things it should read as the control's name.
   */
  iconLabel: string;
  /** Offer count, announced when greater than zero. */
  badge?: number;
}

const TABS: Tab[] = [
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
    <View style={styles.navWrap}>
      <SafeAreaView style={styles.nav} edges={["bottom"]}>
        <View style={styles.tabsWrapper}>
          {tabs.map((tab) => {
            const active =
              tab.route === "/rider"
                ? pathname === "/rider" || pathname === "/rider/"
                : pathname.startsWith(tab.route);
            const badge = tab.badge ?? 0;
            return (
              <Pressable
                key={tab.route}
                style={styles.tab}
                onPress={() => router.navigate(tab.route as never)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={
                  badge > 0
                    ? `${tab.label}, ${badge} offer${badge === 1 ? "" : "s"} waiting`
                    : tab.label
                }
                accessibilityHint={`${tab.iconLabel} tab`}
              >
                <View>
                  {/* Glyph is decorative: the tab's name is its label, so a
                      screen reader is not handed the unicode point name too. */}
                  <Text
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                    style={[styles.tabGlyph, active && styles.tabGlyphActive]}
                  >
                    {tab.glyph}
                  </Text>
                  {badge > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text>
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
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.card,
  },
  tabsWrapper: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xs,
  },
  tab: {
    alignItems: "center",
    gap: 2,
    paddingHorizontal: spacing.md,
    minWidth: 56,
  },
  tabGlyph: { fontSize: 20, color: colors.textFaint },
  tabGlyphActive: { color: colors.primary },
  badge: {
    position: "absolute",
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textInverse,
  },
  tabLabel: {
    ...type.caption,
    fontSize: 11,
    fontWeight: "600",
    color: colors.textFaint,
  },
  tabLabelActive: { color: colors.primary },
});
