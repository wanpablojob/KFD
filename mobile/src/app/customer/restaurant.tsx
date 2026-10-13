import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScrollBottomPadding } from "../../components/TabBarInset";
import {
  fetchMenu,
  fetchRestaurant,
  type MenuItemRow,
  type RestaurantRow,
} from "../../lib/storefront";
import { useCart } from "../../lib/cart-context";
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
  const { count } = useCart();
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
            <Text style={styles.errorTitle}>!</Text>
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
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {restaurantName || "Menu"}
        </Text>
        {count > 0 ? (
          <View style={styles.topCart}>
            <Text style={styles.topCartText}>{count}</Text>
          </View>
        ) : (
          <View style={styles.topCart} />
        )}
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
                <Text style={styles.restaurantName} numberOfLines={2}>
                  {restaurant.name}
                </Text>
                <Text style={type.caption}>
                  {restaurant.cuisine} · {restaurant.city}
                </Text>
                <View style={styles.restaurantMeta}>
                  <Text style={styles.ratingStar}>★</Text>
                  <Text style={styles.ratingValue}>
                    {Number(restaurant.rating).toFixed(1)}
                  </Text>
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
  const { add, pending, acceptPending, dismissPending } = useCart();

  const line = {
    menu_item_id: row.id,
    name: row.name,
    price: row.price,
    restaurantId,
    restaurantName,
  };

  /**
   * This item is the one the customer is being asked about. Asking here, next to
   * the button they just pressed, is the point: `add` holds the line rather than
   * dropping it, so the tap always does something visible.
   */
  const conflict = pending?.line.menu_item_id === row.id ? pending : null;

  if (conflict) {
    return (
      <View style={[styles.item, shadow.card]}>
        <View style={styles.itemBody}>
          <Text style={styles.itemName}>{row.name}</Text>
          <Text style={type.caption}>
            Your cart has {conflict.previousItemCount}{" "}
            {conflict.previousItemCount === 1 ? "item" : "items"} from{" "}
            {conflict.previousRestaurantName}. Adding this starts a new cart.
          </Text>
        </View>
        <View style={styles.conflictActions}>
          <Pressable
            style={({ pressed }) => [
              styles.conflictKeep,
              pressed && styles.conflictKeepPressed,
            ]}
            onPress={dismissPending}
            accessibilityLabel="Keep current cart"
          >
            <Text style={styles.conflictKeepLabel}>KEEP CART</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.conflictSwap,
              pressed && styles.conflictSwapPressed,
              shadow.raised,
            ]}
            onPress={acceptPending}
            accessibilityLabel="Clear current cart and add this item"
          >
            <Text style={styles.conflictSwapLabel}>CLEAR &amp; ADD</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.item, shadow.card]}>
      <MenuItemThumb uri={row.image_url} />
      <View style={styles.itemBody}>
        <Text style={styles.itemName}>{row.name}</Text>
        <Text style={type.price}>₱{row.price.toFixed(2)}</Text>
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.addBtn,
          closed && styles.addBtnClosed,
          pressed && !closed && styles.addBtnPressed,
        ]}
        onPress={() => add(line)}
        disabled={closed}
        accessibilityLabel={
          closed ? `${row.name}, restaurant closed` : `Add ${row.name} to cart`
        }
        accessibilityState={{ disabled: closed }}
      >
        <Text style={styles.addLabel}>{closed ? "CLOSED" : "ADD"}</Text>
      </Pressable>
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
  backGlyph: { fontSize: 30, color: colors.text, lineHeight: 32 },
  topTitle: { ...type.heading, color: colors.text },
  topCart: {
    minWidth: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  topCartText: { fontSize: 12, fontWeight: "800", color: colors.textInverse },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  restaurantHeader: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 4,
    marginBottom: spacing.xs,
  },
  restaurantName: { ...type.title, color: colors.text },
  restaurantMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  ratingStar: { fontSize: 14, color: colors.accent },
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
  errorTitle: { fontSize: 22, fontWeight: "800", color: colors.danger },
  error: { ...type.body, color: colors.danger, textAlign: "center" },
});
