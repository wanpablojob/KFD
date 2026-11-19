import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScrollBottomPadding } from "../../components/TabBarInset";
import { useAllDishes } from "../../components/CategoryGrid";
import { FOOD_GROUPS, type BrowseDish } from "../../lib/food-groups";
import { colors, radius, shadow, spacing, type } from "../../lib/theme";

/**
 * One food category across every shop (opened from a home tile): a two-column
 * grid of dishes, open shops first. A dish opens its shop's menu.
 */
export default function CategoryScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPadding = useScrollBottomPadding();
  const group = FOOD_GROUPS.find((g) => g.key === key);
  const { byGroup, openIds, isPending } = useAllDishes();
  const dishes = (group && byGroup.get(group.key)) || [];
  const icon = (group?.icon ?? "restaurant") as ComponentProps<typeof Ionicons>["name"];

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: spacing.lg + insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {group?.label ?? "Menu"}
        </Text>
      </View>

      {isPending ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <FlatList
          data={dishes}
          keyExtractor={(d) => d.key}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPadding }]}
          ListEmptyComponent={
            <Text style={[type.body, styles.empty]}>
              Nothing in this category right now.
            </Text>
          }
          renderItem={({ item }) => (
            <DishTile
              dish={item}
              open={openIds.has(item.restaurantId)}
              icon={icon}
              onOpen={() =>
                router.push({
                  pathname: "/customer/restaurant",
                  params: { id: item.restaurantId },
                })
              }
            />
          )}
        />
      )}
    </View>
  );
}

function DishTile({
  dish,
  open,
  icon,
  onOpen,
}: {
  dish: BrowseDish;
  open: boolean;
  icon: ComponentProps<typeof Ionicons>["name"];
  onOpen: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        shadow.card,
        !open && styles.closed,
        pressed && styles.pressed,
      ]}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${dish.name} from ${dish.restaurantName}, ${dish.hasSizes ? "from " : ""}${dish.price} pesos${open ? "" : ", closed"}`}
    >
      {dish.imageUrl ? (
        <Image source={{ uri: dish.imageUrl }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.placeholder]}>
          <Ionicons name={icon} size={36} color={colors.accent} />
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
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
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { ...type.title, flex: 1 },
  loading: { marginTop: spacing.xl },
  list: { padding: spacing.lg, gap: spacing.md },
  row: { justifyContent: "space-between" },
  empty: { textAlign: "center", marginTop: spacing.xl, color: colors.textMuted },
  tile: {
    width: "48%",
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  closed: { opacity: 0.55 },
  pressed: { opacity: 0.85 },
  image: { width: "100%", aspectRatio: 1 },
  placeholder: {
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { padding: spacing.sm, gap: 2 },
  name: { ...type.label, color: colors.text, minHeight: 36 },
  shop: { ...type.caption, color: colors.textMuted },
  price: { ...type.label, color: colors.secondary },
});
