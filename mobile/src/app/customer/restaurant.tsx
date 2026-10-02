import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchMenu, type MenuItemRow } from "../../lib/storefront";
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

  const [menu, setMenu] = useState<MenuItemRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { count } = useCart();
  const router = useRouter();

  useEffect(() => {
    if (!restaurantId) return;
    let active = true;
    fetchMenu(restaurantId)
      .then((rows) => {
        if (active) setMenu(rows);
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
          contentContainerStyle={styles.list}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <MenuItemCard
              row={item}
              restaurantId={restaurantId}
              restaurantName={restaurantName}
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
}: {
  row: MenuItemRow;
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
      <View style={styles.itemBody}>
        <Text style={styles.itemName}>{row.name}</Text>
        <Text style={type.price}>₱{row.price.toFixed(2)}</Text>
      </View>
      <Pressable
        style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
        onPress={() => add(line)}
        accessibilityLabel={`Add ${row.name} to cart`}
      >
        <Text style={styles.addLabel}>ADD</Text>
      </Pressable>
    </View>
  );
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
  itemName: { ...type.body, fontWeight: "700", color: colors.text },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
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
