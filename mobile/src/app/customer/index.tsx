import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NotificationBell } from "../../components/NotificationBell";
import { useScrollBottomPadding } from "../../components/TabBarInset";
import { useSession } from "../../lib/session-context";
import { useActiveRestaurants, useFavorites, useMyOrders } from "../../lib/hooks";
import { homeSections } from "../../lib/customer-home";
import { greetingFor } from "../../lib/home-picks";
import { colors, radius, shadow, spacing, type } from "../../lib/theme";
import { statusLabel } from "../../lib/order-status";
import { BrandMark } from "../../components/BrandMark";
import { CategoryGrid, useAllDishes } from "../../components/CategoryGrid";

const STATUS_COPY: Record<string, string> = {
  pending: "Waiting for the restaurant to accept",
  confirmed: "Accepted by the restaurant",
  preparing: "Being prepared",
  out_for_delivery: "On the way to you",
};

/**
 * The customer's start screen: the order on its way, then the menu as big food
 * tiles. Shops and search live on the Shops tab.
 */
export default function CustomerHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPadding = useScrollBottomPadding();
  const { user } = useSession();
  const restaurants = useActiveRestaurants();
  const orders = useMyOrders();
  const favorites = useFavorites();

  const name =
    typeof user?.user_metadata?.name === "string" && user.user_metadata.name.trim()
      ? user.user_metadata.name.trim().split(/\s+/)[0]
      : null;

  const sections = useMemo(
    () => homeSections(orders.data ?? [], restaurants.data ?? [], favorites.data ?? []),
    [orders.data, restaurants.data, favorites.data]
  );
  const dishes = useAllDishes();
  const now = new Date();

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: spacing.lg + insets.top, paddingBottom: bottomPadding },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={restaurants.isRefetching || orders.isRefetching}
            onRefresh={() => {
              void restaurants.refetch();
              void orders.refetch();
              void favorites.refetch();
              void dishes.refetch();
            }}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <BrandMark />
            <Text style={type.display}>{name ? `Hi, ${name}!` : "Hi there!"}</Text>
            <Text style={styles.greeting}>{greetingFor(now.getHours())}</Text>
          </View>
          <NotificationBell />
        </View>

        <Pressable
          style={[styles.search, shadow.card]}
          onPress={() => router.navigate("/customer/shops")}
          accessibilityRole="search"
          accessibilityLabel="Search dishes, restaurants or cuisine"
        >
          <Ionicons name="search" size={18} color={colors.secondary} />
          <Text style={styles.searchText}>Search dishes, restaurants or cuisine</Text>
        </Pressable>

        {sections.activeOrder ? (
          <Pressable
            style={[styles.active, shadow.raised]}
            onPress={() =>
              router.push({
                pathname: "/track",
                params: { ref: sections.activeOrder!.reference },
              })
            }
            accessibilityRole="button"
          >
            <Ionicons name="bicycle" size={28} color={colors.textInverse} />
            <View style={styles.activeText}>
              <Text style={styles.activeTitle}>
                {sections.activeOrder.status in STATUS_COPY
                  ? statusLabel(
                      STATUS_COPY,
                      sections.activeOrder.status,
                      sections.activeOrder.ready_for_pickup_at
                    )
                  : "Your order"}
              </Text>
              <Text style={styles.activeSub}>
                {sections.activeOrder.reference} · Tap to track
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textInverse} />
          </Pressable>
        ) : null}

        {/* The menu, the way food chains' apps lead; shops have their own tab. */}
        <CategoryGrid
          available={new Set(dishes.byGroup.keys())}
          onOpen={(key) =>
            router.push({ pathname: "/customer/category", params: { key } })
          }
        />

        {!restaurants.isPending && sections.openNow.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="moon-outline" size={36} color={colors.textFaint} />
            <Text style={type.heading}>No kitchens are open right now</Text>
            <Text style={[type.caption, styles.center]}>
              Check back soon, or browse the shops to plan your next order.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  headerText: { flex: 1, gap: 4 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  searchText: { ...type.body, color: colors.textFaint },
  active: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  activeText: { flex: 1, gap: 2 },
  activeTitle: { ...type.heading, color: colors.textInverse },
  activeSub: { ...type.caption, color: colors.primarySoft },
  greeting: { ...type.body, color: colors.textMuted },
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  center: { textAlign: "center" },
});
