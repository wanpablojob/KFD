import { useMemo } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { FOOD_GROUPS, dishesByGroup, type FoodGroupKey } from "../lib/food-groups";
import { useActiveRestaurants } from "../lib/hooks";
import { fetchMenusFor } from "../lib/storefront";
import { colors, radius, shadow, spacing, type } from "../lib/theme";

// Bundled with the app so the tiles never wait on the network. Commons photos
// under free licences; credits on the website's /photo-credits page.
const TILE_IMAGES: Record<FoodGroupKey, number> = {
  coffee: require("../../assets/categories/coffee.jpg"),
  drinks: require("../../assets/categories/drinks.jpg"),
  desserts: require("../../assets/categories/desserts.jpg"),
  rice: require("../../assets/categories/rice.jpg"),
  sizzling: require("../../assets/categories/sizzling.jpg"),
  grill: require("../../assets/categories/grill.jpg"),
  seafood: require("../../assets/categories/seafood.jpg"),
  noodles: require("../../assets/categories/noodles.jpg"),
  pasta: require("../../assets/categories/pasta.jpg"),
  burgers: require("../../assets/categories/burgers.jpg"),
  snacks: require("../../assets/categories/snacks.jpg"),
  salads: require("../../assets/categories/salads.jpg"),
  mains: require("../../assets/categories/mains.jpg"),
};

/** Every shop's dishes grouped by kind; home and the category screen share the cache. */
export function useAllDishes() {
  const restaurants = useActiveRestaurants();
  const ids = useMemo(
    () => (restaurants.data ?? []).map((r) => r.id).sort(),
    [restaurants.data]
  );
  const menus = useQuery({
    queryKey: ["homeDishes", ids.join(",")],
    queryFn: () => fetchMenusFor(ids),
    enabled: ids.length > 0,
    staleTime: 10 * 60 * 1000,
  });
  const openIds = useMemo(
    () => new Set((restaurants.data ?? []).filter((r) => r.is_open).map((r) => r.id)),
    [restaurants.data]
  );
  const byGroup = useMemo(
    () => dishesByGroup(menus.data ?? [], openIds),
    [menus.data, openIds]
  );
  return {
    byGroup,
    openIds,
    isPending: menus.isPending && ids.length > 0,
    refetch: menus.refetch,
  };
}

/**
 * The home screen's menu: a two-column grid of big food tiles, the way food
 * chains' apps lead (shops have their own tab). A tile opens its category.
 */
export function CategoryGrid({
  available,
  onOpen,
}: {
  /** Groups that have at least one dish; the rest are not shown. */
  available: ReadonlySet<string>;
  onOpen: (key: FoodGroupKey) => void;
}) {
  const groups = FOOD_GROUPS.filter((g) => available.has(g.key));
  if (groups.length === 0) return null;
  return (
    <View style={styles.grid}>
      {groups.map((g) => (
        <Pressable
          key={g.key}
          style={({ pressed }) => [styles.tile, shadow.card, pressed && styles.pressed]}
          onPress={() => onOpen(g.key)}
          accessibilityRole="button"
          accessibilityLabel={g.label}
        >
          <Image source={TILE_IMAGES[g.key]} style={styles.image} resizeMode="cover" />
          <Text style={styles.label} numberOfLines={2}>
            {g.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: spacing.md,
  },
  tile: {
    width: "48%",
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  pressed: { opacity: 0.85 },
  image: { width: "100%", aspectRatio: 1 },
  label: {
    ...type.heading,
    fontSize: 16,
    textAlign: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    color: colors.text,
  },
});
