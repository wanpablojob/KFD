import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState, type ComponentProps } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { fetchMenusFor, type RestaurantRow } from "../lib/storefront";
import { FOOD_GROUPS, dishesByGroup, type FoodGroupKey } from "../lib/food-groups";
import { colors, radius, shadow, spacing, type } from "../lib/theme";

const MAX_DISHES = 20;

/**
 * "What are you craving?": dishes from every shop, by kind (food-groups.ts),
 * the way food apps lead with food rather than with a list of shops. A dish
 * opens its shop's menu.
 */
export function DishBrowser({
  restaurants,
  onOpen,
}: {
  restaurants: RestaurantRow[];
  onOpen: (restaurantId: string) => void;
}) {
  const ids = useMemo(() => restaurants.map((r) => r.id).sort(), [restaurants]);
  const menus = useQuery({
    queryKey: ["homeDishes", ids.join(",")],
    queryFn: () => fetchMenusFor(ids),
    enabled: ids.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const groups = useMemo(
    () =>
      dishesByGroup(
        menus.data ?? [],
        new Set(restaurants.filter((r) => r.is_open).map((r) => r.id))
      ),
    [menus.data, restaurants]
  );
  const available = FOOD_GROUPS.filter((g) => (groups.get(g.key)?.length ?? 0) > 0);
  const [chosen, setChosen] = useState<FoodGroupKey | null>(null);
  const selected = available.find((g) => g.key === chosen) ?? available[0];

  if (available.length === 0 || !selected) return null;
  const dishes = (groups.get(selected.key) ?? []).slice(0, MAX_DISHES);
  const openIds = new Set(restaurants.filter((r) => r.is_open).map((r) => r.id));

  return (
    <View style={styles.section}>
      <Text style={styles.title}>What are you craving?</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {available.map((g) => {
          const active = g.key === selected.key;
          return (
            <Pressable
              key={g.key}
              onPress={() => setChosen(g.key)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Ionicons
                name={g.icon as ComponentProps<typeof Ionicons>["name"]}
                size={16}
                color={active ? colors.textInverse : colors.secondary}
              />
              <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                {g.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dishes}
      >
        {dishes.map((dish) => {
          const open = openIds.has(dish.restaurantId);
          return (
            <Pressable
              key={dish.key}
              style={[styles.card, shadow.card, !open && styles.closed]}
              onPress={() => onOpen(dish.restaurantId)}
              accessibilityRole="button"
              accessibilityLabel={`${dish.name} from ${dish.restaurantName}, ${dish.hasSizes ? "from " : ""}${dish.price} pesos${open ? "" : ", closed"}`}
            >
              {dish.imageUrl ? (
                <Image source={{ uri: dish.imageUrl }} style={styles.image} />
              ) : (
                <View style={[styles.image, styles.placeholder]}>
                  <Ionicons
                    name={selected.icon as ComponentProps<typeof Ionicons>["name"]}
                    size={28}
                    color={colors.accent}
                  />
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={styles.dishName} numberOfLines={2}>
                  {dish.name}
                </Text>
                <Text style={styles.shop} numberOfLines={1}>
                  {dish.restaurantName}
                </Text>
                <Text style={styles.price}>
                  {dish.hasSizes ? "from " : ""}₱{dish.price.toFixed(0)}
                  {open ? "" : " · Closed"}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  title: { ...type.heading },
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipLabel: { ...type.label, color: colors.text },
  chipLabelActive: { color: colors.textInverse },
  dishes: { gap: spacing.md, paddingRight: spacing.lg, paddingVertical: 4 },
  card: {
    width: 150,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  closed: { opacity: 0.55 },
  image: { width: "100%", height: 96 },
  placeholder: {
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { padding: spacing.sm, gap: 2 },
  dishName: { ...type.label, color: colors.text, minHeight: 36 },
  shop: { ...type.caption, color: colors.textMuted },
  price: { ...type.label, color: colors.secondary },
});
