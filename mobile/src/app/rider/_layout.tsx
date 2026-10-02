import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, usePathname, useRouter } from "expo-router";
import { colors, spacing, type } from "../../lib/theme";

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
}

const TABS: Tab[] = [
  // Available is first because it is the queue a rider opens the app to work.
  // Deliveries is what they already accepted.
  { route: "/rider/offers", label: "Available", glyph: "◈" },
  { route: "/rider", label: "Deliveries", glyph: "≡" },
  { route: "/rider/earnings", label: "Earnings", glyph: "₱" },
  { route: "/rider/profile", label: "Profile", glyph: "◍" },
];

function BottomNav({ pathname }: { pathname: string }) {
  const router = useRouter();
  return (
    <View style={styles.navWrap}>
      <SafeAreaView style={styles.nav} edges={["bottom"]}>
        <View style={styles.tabsWrapper}>
          {TABS.map((tab) => {
            const active =
              tab.route === "/rider"
                ? pathname === "/rider" || pathname === "/rider/"
                : pathname.startsWith(tab.route);
            return (
              <Pressable
                key={tab.route}
                style={styles.tab}
                onPress={() => router.navigate(tab.route as never)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabGlyph, active && styles.tabGlyphActive]}>
                  {tab.glyph}
                </Text>
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
  tabLabel: {
    ...type.caption,
    fontSize: 11,
    fontWeight: "600",
    color: colors.textFaint,
  },
  tabLabelActive: { color: colors.primary },
});
