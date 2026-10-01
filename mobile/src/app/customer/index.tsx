import { useCallback, useMemo, useState } from "react";
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
import { useOrderFees, useRestaurants, RestaurantRow } from "../../lib/hooks";
import { colors, radius, shadow, spacing, type } from "../../lib/theme";

export default function CustomerHomeScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const {
    data: restaurants,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useRestaurants(debouncedQuery, cuisine);

  // The advertised delivery price, straight from the server. Null until it
  // lands, in which case the card simply omits the claim rather than guessing.
  const { data: fees } = useOrderFees();
  const deliveryFee = fees?.delivery_fee ?? null;

  const cuisines = useMemo(() => {
    const set = new Set((restaurants ?? []).map((r) => r.cuisine).filter(Boolean));
    return [...set].sort();
  }, [restaurants]);

  // Debounce search input to avoid excessive RPC calls
  useCallback(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  if (isLoading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={type.caption}>Finding places near you…</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.errorTitle}>!</Text>
        <Text style={styles.error}>
          {error instanceof Error ? error.message : "Could not load restaurants."}
        </Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryLabel}>RETRY</Text>
        </Pressable>
      </View>
    );
  }

  const visible = restaurants ?? [];

  return (
    <View style={styles.screen}>
      <FlatList
        data={visible}
        keyExtractor={(row) => row.id}
        contentContainerStyle={[styles.list, { paddingTop: spacing.lg + insets.top }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.deliverTo}>DELIVER TO</Text>
            <Text style={type.display}>Kabankalan City</Text>

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
                <Text style={styles.promoBadge}>FREE DELIVERY OVER ₱500</Text>
                <Text style={styles.promoTitle}>Local food, delivered fast</Text>
              </View>
              <Text style={styles.promoGlyph}>🍲</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {cuisines.length === 0
                ? "No places are open for orders right now."
                : "Try a different search or cuisine."}
            </Text>
          </View>
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
          <Text style={styles.metaDot}>·</Text>
          <Text style={type.caption}>20-30 min</Text>
        </View>
      </View>

      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: "center", justifyContent: "center", gap: spacing.md },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  deliverTo: { ...type.eyebrow, color: colors.textFaint },
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
  promoBadge: { ...type.eyebrow, color: colors.secondary },
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
});

export { RestaurantRow };
