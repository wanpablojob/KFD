import { useMemo, useState } from "react";
import {
  ActivityIndicator,
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
  useOrderFees,
  useRestaurants,
  RestaurantRow,
} from "../../lib/hooks";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import {
  storefrontEmptyState,
  type StorefrontEmptyKind,
} from "../../lib/storefront-empty";
import { colors, radius, shadow, spacing, type } from "../../lib/theme";

export default function CustomerHomeScreen() {
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

  // The advertised delivery price, straight from the server. Null until it
  // lands, in which case the card simply omits the claim rather than guessing.
  const { data: fees } = useOrderFees();
  const deliveryFee = fees?.delivery_fee ?? null;

  const cuisines = useMemo(() => {
    const set = new Set((catalogue ?? []).map((r) => r.cuisine).filter(Boolean));
    return [...set].sort();
  }, [catalogue]);

  const visible = restaurants ?? [];
  const filtersActive = debouncedQuery.trim().length > 0 || cuisine !== null;
  const emptyKind = storefrontEmptyState({
    isLoading,
    isError,
    catalogueCount: (catalogue ?? []).length,
    resultCount: visible.length,
    filtersActive,
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
            <Text style={styles.brand}>KABANKALAN FOOD DELIVERY</Text>
            <Text style={type.display}>What are you craving?</Text>

            <View style={[styles.search, shadow.card]}>
              <Text style={styles.searchGlyph}>⌕</Text>
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search restaurants or cuisine"
                placeholderTextColor={colors.textFaint}
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel="Search restaurants"
              />
              {query ? (
                <Pressable
                  onPress={() => setQuery("")}
                  accessibilityLabel="Clear search"
                >
                  <Text style={styles.clear}>✕</Text>
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

            <View style={styles.promo}>
              <View style={styles.promoText}>
                <Text style={styles.promoTitle}>Local food, delivered fast</Text>
              </View>
              <Text style={styles.promoGlyph}>🍲</Text>
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
        renderItem={({ item }) => (
          <RestaurantCard row={item} deliveryFee={deliveryFee} />
        )}
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
        <Text style={styles.errorTitle}>!</Text>
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

function RestaurantCard({
  row,
  deliveryFee,
}: {
  row: RestaurantRow;
  deliveryFee: number | null;
}) {
  const router = useRouter();
  return (
    <Pressable
      style={({ pressed }) => [styles.card, shadow.card, pressed && styles.cardPressed]}
      onPress={() =>
        router.push({ pathname: "/customer/restaurant", params: { id: row.id } })
      }
    >
      <View style={styles.thumb}>
        <Text style={styles.thumbInitial}>{row.name.charAt(0).toUpperCase()}</Text>
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
            <Text style={styles.ratingStar}>★</Text>
            <Text style={styles.ratingValue}>{row.rating.toFixed(1)}</Text>
          </View>
          {deliveryFee !== null ? (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Text style={type.caption}>₱{deliveryFee.toFixed(0)} delivery</Text>
            </>
          ) : null}
        </View>
      </View>

      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
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
  searchGlyph: { fontSize: 18, color: colors.secondary },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  clear: { fontSize: 14, color: colors.textFaint, paddingHorizontal: spacing.xs },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
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
  promoGlyph: { fontSize: 34 },
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
  ratingStar: { fontSize: 12, color: colors.accent },
  ratingValue: { fontSize: 12, fontWeight: "700", color: colors.text },
  metaDot: { fontSize: 12, color: colors.textFaint },
  chevron: { fontSize: 24, color: colors.textFaint, paddingRight: spacing.xs },
  empty: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xxl },
  emptyTitle: { ...type.title, color: colors.textMuted },
  errorTitle: { fontSize: 22, fontWeight: "800", color: colors.danger },
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
