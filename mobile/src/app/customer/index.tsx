import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, type ComponentProps } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NotificationBell } from "../../components/NotificationBell";
import { useScrollBottomPadding } from "../../components/TabBarInset";
import { useSession } from "../../lib/session-context";
import { useActiveRestaurants, useFavorites, useMyOrders } from "../../lib/hooks";
import { homeSections } from "../../lib/customer-home";
import { buildTasteProfile, fetchHomePicks, greetingFor } from "../../lib/home-picks";
import type { RestaurantRow } from "../../lib/storefront";
import { colors, radius, shadow, spacing, type } from "../../lib/theme";

const STATUS_COPY: Record<string, string> = {
  pending: "Waiting for the restaurant to accept",
  confirmed: "Accepted by the restaurant",
  preparing: "Being prepared",
  out_for_delivery: "On the way to you",
};

/**
 * The customer's start screen: the order on its way, kitchens they liked, and
 * what is open now. The full searchable list is the Shops tab.
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
  // Personal picks (AI, with rules on the phone as the fallback). Asked once
  // per three-hour meal window, so the greeting and picks follow the day.
  const now = new Date();
  const mealWindow = Math.floor(now.getHours() / 3);
  const loaded = restaurants.isSuccess && orders.isSuccess;
  const picks = useQuery({
    queryKey: ["homePicks", user?.id, now.toDateString(), mealWindow],
    queryFn: () =>
      fetchHomePicks(
        buildTasteProfile(
          orders.data ?? [],
          restaurants.data ?? [],
          favorites.data ?? [],
          new Date()
        )
      ),
    enabled: loaded,
    staleTime: 3 * 60 * 60 * 1000,
  });
  const byId = new Map((restaurants.data ?? []).map((r) => [r.id, r]));
  const picked = (picks.data?.picks ?? []).flatMap((p) => {
    const r = byId.get(p.restaurant_id);
    return r ? [r] : [];
  });
  const reasons = new Map(
    (picks.data?.picks ?? []).map((p) => [p.restaurant_id, p.reason])
  );

  const openRestaurant = (id: string) =>
    router.push({ pathname: "/customer/restaurant", params: { id } });

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
              void picks.refetch();
            }}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.brand}>KABANKALAN FOOD DELIVERY</Text>
            <Text style={type.display}>{name ? `Hi, ${name}!` : "Hi there!"}</Text>
            <Text style={styles.greeting}>
              {picks.data?.greeting ?? greetingFor(now.getHours())}
            </Text>
          </View>
          <NotificationBell />
        </View>

        <Pressable
          style={[styles.search, shadow.card]}
          onPress={() => router.navigate("/customer/shops")}
          accessibilityRole="search"
          accessibilityLabel="Search restaurants"
        >
          <Ionicons name="search" size={18} color={colors.secondary} />
          <Text style={styles.searchText}>Search restaurants or cuisine</Text>
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
                {STATUS_COPY[sections.activeOrder.status] ?? "Your order"}
              </Text>
              <Text style={styles.activeSub}>
                {sections.activeOrder.reference} · Tap to track
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textInverse} />
          </Pressable>
        ) : null}

        <Row
          title="Picked for you"
          icon="sparkles"
          items={picked}
          reasons={reasons}
          onOpen={openRestaurant}
        />
        <Row title="Order again" items={sections.orderAgain} onOpen={openRestaurant} />
        <Row
          title="Your favourites"
          items={sections.favorites}
          onOpen={openRestaurant}
        />
        <Row title="Open now" items={sections.openNow} onOpen={openRestaurant} />

        {!restaurants.isPending && sections.openNow.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="moon-outline" size={36} color={colors.textFaint} />
            <Text style={type.heading}>No kitchens are open right now</Text>
            <Text style={[type.caption, styles.center]}>
              Check back soon, or browse the shops to plan your next order.
            </Text>
          </View>
        ) : null}

        <Pressable
          style={[styles.allShops, shadow.card]}
          onPress={() => router.navigate("/customer/shops")}
          accessibilityRole="button"
        >
          <Ionicons name="storefront-outline" size={20} color={colors.primary} />
          <Text style={styles.allShopsLabel}>Browse all shops</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

/** A titled horizontal row of restaurant cards; renders nothing when empty. */
function Row({
  title,
  icon,
  items,
  reasons,
  onOpen,
}: {
  title: string;
  icon?: ComponentProps<typeof Ionicons>["name"];
  items: RestaurantRow[];
  /** Why each card is there, for "Picked for you". */
  reasons?: Map<string, string>;
  onOpen: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        {icon ? <Ionicons name={icon} size={18} color={colors.accent} /> : null}
        <Text style={styles.rowTitle}>{title}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowList}
      >
        {items.map((r) => (
          <Pressable
            key={r.id}
            style={({ pressed }) => [
              styles.card,
              shadow.card,
              !r.is_open && styles.cardClosed,
              pressed && styles.cardPressed,
            ]}
            onPress={() => onOpen(r.id)}
            accessibilityRole="button"
            accessibilityLabel={`${r.name}, ${r.cuisine}${r.is_open ? "" : ", closed"}`}
          >
            <View style={styles.thumb}>
              {r.image_url ? (
                <Image
                  source={{ uri: r.image_url }}
                  style={StyleSheet.absoluteFill}
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <Text style={styles.thumbInitial}>
                  {r.name.charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <Text style={styles.cardName} numberOfLines={1}>
              {r.name}
            </Text>
            <Text style={type.caption} numberOfLines={1}>
              {r.cuisine}
            </Text>
            <View style={styles.cardMeta}>
              {r.is_open ? (
                r.rating > 0 ? (
                  <>
                    <Ionicons name="star" size={12} color={colors.accent} />
                    <Text style={styles.metaText}>{r.rating.toFixed(1)}</Text>
                  </>
                ) : (
                  <Text style={styles.metaText}>New</Text>
                )
              ) : (
                <Text style={styles.closed}>Closed</Text>
              )}
            </View>
            {reasons?.get(r.id) ? (
              <Text style={styles.reason} numberOfLines={2}>
                {reasons.get(r.id)}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  headerText: { flex: 1, gap: 4 },
  brand: { ...type.eyebrow, color: colors.secondary, letterSpacing: 1.5 },
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
  row: { gap: spacing.sm },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  greeting: { ...type.body, color: colors.textMuted },
  reason: {
    ...type.caption,
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginTop: 2,
  },
  rowTitle: { ...type.title },
  rowList: { gap: spacing.md, paddingRight: spacing.lg, paddingVertical: 4 },
  card: {
    width: 140,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
  },
  cardClosed: { opacity: 0.6 },
  cardPressed: { opacity: 0.8 },
  thumb: {
    overflow: "hidden",
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  thumbInitial: { fontSize: 30, fontWeight: "800", color: colors.primary },
  cardName: { ...type.label, color: colors.text, fontWeight: "700" },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontSize: 12, fontWeight: "700", color: colors.text },
  closed: { ...type.caption, fontWeight: "700", color: colors.danger },
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  center: { textAlign: "center" },
  allShops: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  allShopsLabel: { ...type.heading, flex: 1 },
});
