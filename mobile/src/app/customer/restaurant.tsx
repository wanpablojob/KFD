import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { TRAVEL_MINUTES } from "../../lib/delivery-estimate";
import { MAX_QUANTITY } from "../../lib/cart-logic";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScrollBottomPadding } from "../../components/TabBarInset";
import {
  fetchMenu,
  fetchRestaurant,
  type MenuItemRow,
  type RestaurantRow,
} from "../../lib/storefront";
import { useFavorites, useToggleFavorite } from "../../lib/hooks";
import { useCart } from "../../lib/cart-context";
import { CartButton } from "../../components/CartButton";
import { colors, radius, shadow, spacing, type } from "../../lib/theme";

/**
 * Menu for one restaurant, grouped by category. Tapping ADD stages it in the
 * cart (client-side line; the server re-prices at order time).
 */
export default function CustomerMenuScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const restaurantId = typeof id === "string" ? id : "";
  const insets = useSafeAreaInsets();
  const bottomPadding = useScrollBottomPadding();

  const [menu, setMenu] = useState<MenuItemRow[] | null>(null);
  const [restaurant, setRestaurant] = useState<RestaurantRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: favorites } = useFavorites();
  const toggleFavorite = useToggleFavorite();
  const isFavorite = !!restaurant && (favorites ?? []).includes(restaurant.id);
  const router = useRouter();

  useEffect(() => {
    if (!restaurantId) return;
    let active = true;
    Promise.all([fetchMenu(restaurantId), fetchRestaurant(restaurantId)])
      .then(([rows, info]) => {
        if (!active) return;
        setMenu(rows);
        setRestaurant(info);
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Could not load the menu.");
        }
      });
    return () => {
      active = false;
    };
  }, [restaurantId]);

  const sections = useMemo(() => groupByCategory(menu ?? []), [menu]);

  // menu_items carries the restaurant name, so this costs no extra request and
  // is what makes the cart-conflict message nameable.
  const restaurantName = menu?.[0]?.restaurant ?? "";

  if (!menu) {
    return (
      <View style={[styles.screen, styles.center]}>
        {error ? (
          <>
            <Ionicons name="alert-circle" size={30} color={colors.danger} />
            <Text style={styles.error}>{error}</Text>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.primary} />
            <Text style={type.caption}>Loading menu…</Text>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: spacing.lg + insets.top }]}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {restaurantName || "Menu"}
        </Text>
        <CartButton />
      </View>

      {sections.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Nothing on the menu</Text>
          <Text style={type.body}>This place has no items available right now.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled
          contentContainerStyle={[styles.list, { paddingBottom: bottomPadding }]}
          ListHeaderComponent={
            restaurant ? (
              <View style={[styles.restaurantHeader, shadow.card]}>
                {restaurant.image_url ? (
                  <Image
                    source={{ uri: restaurant.image_url }}
                    style={styles.cover}
                    accessibilityIgnoresInvertColors
                  />
                ) : null}
                <View style={styles.titleRow}>
                  <Text
                    style={[styles.restaurantName, styles.titleText]}
                    numberOfLines={2}
                  >
                    {restaurant.name}
                  </Text>
                  <Pressable
                    onPress={() =>
                      toggleFavorite.mutate({
                        restaurantId: restaurant.id,
                        favorite: !isFavorite,
                      })
                    }
                    disabled={toggleFavorite.isPending}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isFavorite ? "Remove from favourites" : "Save to favourites"
                    }
                    accessibilityState={{ selected: isFavorite }}
                  >
                    <Ionicons
                      name={isFavorite ? "heart" : "heart-outline"}
                      size={26}
                      color={colors.primary}
                    />
                  </Pressable>
                </View>
                <Text style={type.caption}>
                  {restaurant.cuisine} · {restaurant.city}
                </Text>
                <View style={styles.restaurantMeta}>
                  {Number(restaurant.rating) > 0 ? (
                    <>
                      <Ionicons name="star" size={14} color={colors.accent} />
                      <Text style={styles.ratingValue}>
                        {Number(restaurant.rating).toFixed(1)}
                      </Text>
                      <Text style={styles.metaDot}>·</Text>
                    </>
                  ) : null}
                  {restaurant.is_open ? (
                    <>
                      <Ionicons
                        name="time-outline"
                        size={14}
                        color={colors.textMuted}
                      />
                      <Text style={type.caption}>
                        Open · delivery in about{" "}
                        {restaurant.prep_minutes + TRAVEL_MINUTES.min}–
                        {restaurant.prep_minutes + TRAVEL_MINUTES.max} min
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.closedText}>
                      Closed right now · you can browse the menu
                    </Text>
                  )}
                </View>
              </View>
            ) : null
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <MenuItemCard
              row={item}
              restaurantId={restaurantId}
              restaurantName={restaurantName}
              closed={restaurant ? !restaurant.is_open : false}
            />
          )}
        />
      )}
    </View>
  );
}

function MenuItemCard({
  row,
  restaurantId,
  restaurantName,
  closed,
}: {
  row: MenuItemRow;
  closed: boolean;
  restaurantId: string;
  restaurantName: string;
}) {
  const { add, lines, setQuantity } = useCart();
  const inCart = lines.find((l) => l.menu_item_id === row.id)?.quantity ?? 0;

  const line = {
    menu_item_id: row.id,
    name: row.name,
    price: row.price,
    restaurantId,
    restaurantName,
  };

  /**
   * Adding from another restaurant is normal now: the basket holds food from
   * several kitchens and one rider collects them all. What the basket cannot
   * hold is an eleventh kitchen, and that has to say so out loud rather than
   * swallowing the tap.
   */
  const handleAdd = () => {
    const result = add(line);
    if (result.kind === "too_many_shops") {
      Alert.alert(
        "Ten restaurants is the limit",
        "You can order from up to 10 restaurants in one delivery. Remove one to add another."
      );
    }
  };

  return (
    <View style={[styles.item, shadow.card]}>
      <MenuItemThumb uri={row.image_url} />
      <View style={styles.itemBody}>
        <Text style={styles.itemName}>{row.name}</Text>
        <Text style={type.price}>₱{row.price.toFixed(2)}</Text>
      </View>
      {inCart > 0 && !closed ? (
        // Once it is in the cart, show how many and let the customer change it
        // here instead of bouncing to the cart screen.
        <View style={styles.stepper}>
          <Pressable
            style={styles.stepBtn}
            onPress={() => setQuantity(row.id, inCart - 1)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={
              inCart === 1 ? `Remove ${row.name}` : `One less ${row.name}`
            }
          >
            <Ionicons
              name={inCart === 1 ? "trash-outline" : "remove"}
              size={18}
              color={colors.primary}
            />
          </Pressable>
          <Text style={styles.stepCount} accessibilityLabel={`${inCart} in cart`}>
            {inCart}
          </Text>
          <Pressable
            style={styles.stepBtn}
            onPress={handleAdd}
            disabled={inCart >= MAX_QUANTITY}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`One more ${row.name}`}
          >
            <Ionicons
              name="add"
              size={18}
              color={inCart >= MAX_QUANTITY ? colors.textFaint : colors.primary}
            />
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.addBtn,
            closed && styles.addBtnClosed,
            pressed && !closed && styles.addBtnPressed,
          ]}
          onPress={handleAdd}
          disabled={closed}
          accessibilityLabel={
            closed ? `${row.name}, restaurant closed` : `Add ${row.name} to cart`
          }
          accessibilityState={{ disabled: closed }}
        >
          <Text style={styles.addLabel}>{closed ? "CLOSED" : "ADD"}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** The item's image when it has one; nothing when it does not (0056). */
function MenuItemThumb({ uri }: { uri: string | null }) {
  if (!uri) return null;
  return <Image source={{ uri }} style={styles.itemImage} resizeMode="cover" />;
}

function groupByCategory(rows: MenuItemRow[]) {
  const byName = new Map<string, MenuItemRow[]>();
  for (const row of rows) {
    const title = row.category || "Other";
    const bucket = byName.get(title);
    if (bucket) bucket.push(row);
    else byName.set(title, [row]);
  }
  return [...byName.entries()].map(([title, data]) => ({ title, data }));
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.card,
  },
  backBtn: { width: 32, height: 32, justifyContent: "center" },
  topTitle: { ...type.heading, color: colors.text, flex: 1, textAlign: "center" },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  titleText: { flex: 1 },
  restaurantHeader: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 4,
    marginBottom: spacing.xs,
    overflow: "hidden",
  },
  // Full-bleed across the card's top, cancelling the card's padding.
  cover: {
    height: 150,
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.lg,
    marginBottom: spacing.sm,
  },
  restaurantName: { ...type.title, color: colors.text },
  restaurantMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  ratingValue: { fontSize: 14, fontWeight: "700", color: colors.text },
  sectionHeader: {
    ...type.eyebrow,
    textTransform: "uppercase",
    backgroundColor: colors.background,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  itemBody: { flex: 1, gap: 4 },
  itemImage: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  itemName: { ...type.body, fontWeight: "700", color: colors.text },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  addBtnClosed: { backgroundColor: colors.textFaint },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  stepBtn: { padding: 4 },
  stepCount: { ...type.label, color: colors.text, minWidth: 18, textAlign: "center" },
  metaDot: { fontSize: 12, color: colors.textFaint },
  closedText: { ...type.caption, fontWeight: "700", color: colors.danger },
  addBtnPressed: { backgroundColor: colors.primaryDark },
  conflictActions: { flexDirection: "row", gap: spacing.sm },
  conflictKeep: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
  },
  conflictKeepPressed: { backgroundColor: colors.surface },
  conflictKeepLabel: { ...type.caption, fontWeight: "700" },
  conflictSwap: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    justifyContent: "center",
  },
  conflictSwapPressed: { backgroundColor: colors.primaryDark },
  conflictSwapLabel: { ...type.caption, fontWeight: "700", color: colors.textInverse },
  addLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.textInverse,
  },
  emptyTitle: { ...type.title, color: colors.textMuted },
  error: { ...type.body, color: colors.danger, textAlign: "center" },
});
