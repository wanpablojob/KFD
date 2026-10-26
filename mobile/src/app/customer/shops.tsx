import { useMemo, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ActivityIndicator,
  Image,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScrollBottomPadding } from "../../components/TabBarInset";
import {
  useActiveRestaurants,
  useRestaurants,
  useMenuSearch,
  RestaurantRow,
  useFavorites,
} from "../../lib/hooks";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import {
  storefrontEmptyState,
  type StorefrontEmptyKind,
} from "../../lib/storefront-empty";
import { TRAVEL_MINUTES } from "../../lib/delivery-estimate";
import type { MenuItemSearchRow } from "../../lib/storefront";
import { colors, radius, shadow, spacing, type } from "../../lib/theme";
import { NotificationBell } from "../../components/NotificationBell";
import { CartButton } from "../../components/CartButton";

export default function CustomerShopsScreen() {
  const insets = useSafeAreaInsets();
  const bottomPadding = useScrollBottomPadding();
  const [query, setQuery] = useState("");
  const [cuisine, setCuisine] = useState<string | null>(null);
  // The query the server actually searches on, held back until typing pauses.
  const debouncedQuery = useDebouncedValue(query, 300);

  const {
    data: restaurants,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useRestaurants(debouncedQuery, cuisine);

  // The unfiltered catalogue drives the cuisine chips. Deriving them from the
  // already-filtered `restaurants` collapsed the chip row to whatever was
  // selected, so a cuisine could never be un-chosen from the row.
  const { data: catalogue } = useActiveRestaurants();

  // Dishes matching the same term. Restaurant search cannot see a menu item, so
  // without this "baboy" -- a real dish at Habhab -- reported no match at all.
  const { data: dishes } = useMenuSearch(debouncedQuery, cuisine);
  const dishRows = debouncedQuery.trim() ? (dishes ?? []) : [];

  const cuisines = useMemo(() => {
    const set = new Set((catalogue ?? []).map((r) => r.cuisine).filter(Boolean));
    return [...set].sort();
  }, [catalogue]);

  const { data: favorites } = useFavorites();
  // Saved restaurants first, keeping the server's order (open before closed)
  // within each group.
  const visible = useMemo(() => {
    const saved = new Set(favorites ?? []);
    const rows = restaurants ?? [];
    return [
      ...rows.filter((r) => saved.has(r.id)),
      ...rows.filter((r) => !saved.has(r.id)),
    ];
  }, [restaurants, favorites]);
  const filtersActive = debouncedQuery.trim().length > 0 || cuisine !== null;
  const emptyKind = storefrontEmptyState({
    isLoading,
    isError,
    catalogueCount: (catalogue ?? []).length,
    resultCount: visible.length,
    filtersActive,
    dishCount: dishRows.length,
  });

  function clearFilters() {
    setQuery("");
    setCuisine(null);
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={visible}
        keyExtractor={(row) => row.id}
        contentContainerStyle={[
          styles.list,
          { paddingTop: spacing.lg + insets.top, paddingBottom: bottomPadding },
        ]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            {/* The brand name, not the customer's location: the app has no
                location permission and must not imply it knows where they are. */}
            <View style={styles.brandRow}>
              <Text style={styles.brand}>KABANKALAN FOOD DELIVERY</Text>
              <View style={styles.headerActions}>
                <CartButton />
                <NotificationBell />
              </View>
            </View>
            <Text style={type.display}>What are you craving?</Text>

            <View style={[styles.search, shadow.card]}>
              <Ionicons name="search" size={18} color={colors.secondary} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search dishes, restaurants or cuisine"
                placeholderTextColor={colors.textFaint}
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel="Search dishes, restaurants or cuisine"
              />
              {query ? (
                <Pressable
                  onPress={() => setQuery("")}
                  accessibilityLabel="Clear search"
                >
                  <Ionicons name="close-circle" size={18} color={colors.textFaint} />
                </Pressable>
              ) : null}
            </View>

            {cuisines.length > 0 ? (
              <FlatList
                data={cuisines}
                keyExtractor={(c) => c}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
                renderItem={({ item }) => {
                  const active = cuisine === item;
                  return (
                    <Pressable
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setCuisine(active ? null : item)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {item}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            ) : null}

            {dishRows.length > 0 ? (
              <View style={styles.dishes}>
                <Text style={styles.dishesTitle}>Dishes</Text>
                {dishRows.map((dish) => (
                  <DishRow key={dish.id} row={dish} />
                ))}
              </View>
            ) : null}

            <View style={styles.promo}>
              <View style={styles.promoText}>
                <Text style={styles.promoTitle}>
                  From Kabankalan kitchens to your door
                </Text>
              </View>
              <Ionicons name="bicycle" size={34} color={colors.primary} />
            </View>
          </View>
        }
        ListEmptyComponent={
          <StorefrontEmpty
            kind={emptyKind}
            error={error}
            onRetry={() => refetch()}
            onClearFilters={clearFilters}
          />
        }
        renderItem={({ item }) => <RestaurantCard row={item} />}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />
        }
      />
    </View>
  );
}

function StorefrontEmpty({
  kind,
  error,
  onRetry,
  onClearFilters,
}: {
  kind: StorefrontEmptyKind | null;
  error: unknown;
  onRetry: () => void;
  onClearFilters: () => void;
}) {
  if (kind === null) return null;

  if (kind === "loading") {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={colors.primary} />
        <Text style={type.caption}>Finding places…</Text>
      </View>
    );
  }

  if (kind === "error") {
    return (
      <View style={styles.empty}>
        <Ionicons name="alert-circle" size={30} color={colors.danger} />
        <Text style={styles.error}>
          {error instanceof Error ? error.message : "Could not load restaurants."}
        </Text>
        <Pressable style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryLabel}>RETRY</Text>
        </Pressable>
      </View>
    );
  }

  if (kind === "no_match") {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No match for that search.</Text>
        <Pressable style={styles.clearButton} onPress={onClearFilters}>
          <Text style={styles.clearButtonLabel}>Clear filters</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>No places are open for orders right now.</Text>
    </View>
  );
}

/**
 * A dish that matched the search (0142). It opens the shop rather than adding
 * to the cart: the menu screen is where the price, options and Add button live,
 * and a one-tap add from a search row would skip the place a customer confirms
 * what they are buying.
 *
 * A closed kitchen still shows its dish -- the customer can browse -- but says
 * so, the same way the shop card does.
 */
function DishRow({ row }: { row: MenuItemSearchRow }) {
  const router = useRouter();
  return (
    <Pressable
      style={({ pressed }) => [styles.dish, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${row.name} at ${row.restaurant}, ₱${Number(row.price).toFixed(2)}`}
      accessibilityHint={row.is_open ? undefined : "Closed right now"}
      onPress={() =>
        router.push({
          pathname: "/customer/restaurant",
          params: { id: row.restaurant_id },
        })
      }
    >
      <View style={styles.dishBody}>
        <Text style={styles.dishName} numberOfLines={1}>
          {row.name}
        </Text>
        <Text style={type.caption} numberOfLines={1}>
          {row.restaurant}
          {row.is_open ? "" : " · Closed"}
        </Text>
      </View>
      <Text style={type.price}>₱{Number(row.price).toFixed(2)}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

/**
 * No delivery fee on the card: it depends on the customer's barangay (0080),
 * and the cart shows the real one once they pick it.
 */
function RestaurantCard({ row }: { row: RestaurantRow }) {
  const router = useRouter();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        shadow.card,
        !row.is_open && styles.cardClosed,
        pressed && styles.cardPressed,
      ]}
      accessibilityHint={row.is_open ? undefined : "Closed right now"}
      onPress={() =>
        router.push({ pathname: "/customer/restaurant", params: { id: row.id } })
      }
    >
      <View style={styles.thumb}>
        {row.image_url ? (
          <Image
            source={{ uri: row.image_url }}
            style={StyleSheet.absoluteFill}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text style={styles.thumbInitial}>{row.name.charAt(0).toUpperCase()}</Text>
        )}
        {row.rating >= 4.5 ? (
          <View style={styles.ribbon}>
            <Text style={styles.ribbonText}>TOP</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>
          {row.name}
        </Text>
        <Text style={type.caption} numberOfLines={1}>
          {row.cuisine} · {row.city}
        </Text>

        <View style={styles.cardMeta}>
          <View style={styles.rating}>
            {row.rating > 0 ? (
              <>
                <Ionicons name="star" size={12} color={colors.accent} />
                <Text style={styles.ratingValue}>{row.rating.toFixed(1)}</Text>
              </>
            ) : (
              <Text style={styles.ratingValue}>New</Text>
            )}
          </View>
          <Text style={styles.metaDot}>·</Text>
          {row.is_open ? (
            <Text style={type.caption}>
              {row.prep_minutes + TRAVEL_MINUTES.min}–
              {row.prep_minutes + TRAVEL_MINUTES.max} min
            </Text>
          ) : (
            <Text style={styles.closedLabel}>Closed</Text>
          )}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  screen: { flex: 1, backgroundColor: colors.background },
  cardClosed: { opacity: 0.6 },
  closedLabel: { ...type.caption, fontWeight: "700", color: colors.danger },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  brand: { ...type.eyebrow, color: colors.textFaint },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
  dishes: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.xs,
    gap: 2,
  },
  dishesTitle: {
    ...type.eyebrow,
    color: colors.textFaint,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  dish: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  dishBody: { flex: 1, gap: 1 },
  dishName: { ...type.body, fontWeight: "600", color: colors.text },
  chip: {
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  chipTextActive: { color: colors.textInverse },
  promo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.goldSoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.xs,
  },
  promoText: { flex: 1, gap: 2 },
  promoTitle: { ...type.heading, color: colors.text },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  cardPressed: { backgroundColor: colors.surface },
  thumb: {
    overflow: "hidden",
    width: 68,
    height: 68,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbInitial: { fontSize: 26, fontWeight: "800", color: colors.gold },
  ribbon: {
    position: "absolute",
    top: -1,
    right: -1,
    backgroundColor: colors.gold,
    borderBottomLeftRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  ribbonText: { fontSize: 9, fontWeight: "800", color: colors.primaryDark },
  cardBody: { flex: 1, gap: 2 },
  cardName: { ...type.heading, color: colors.text },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  rating: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingValue: { fontSize: 12, fontWeight: "700", color: colors.text },
  metaDot: { fontSize: 12, color: colors.textFaint },
  empty: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xxl },
  emptyTitle: { ...type.title, color: colors.textMuted },
  error: { ...type.body, color: colors.danger, textAlign: "center" },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  retryLabel: { ...type.label, color: colors.textInverse },
  clearButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  clearButtonLabel: { ...type.label, color: colors.primary },
});

export { RestaurantRow };
