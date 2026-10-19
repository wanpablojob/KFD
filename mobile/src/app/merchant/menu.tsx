import { useState } from "react";
import { Image, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import {
  MerchantButton,
  MerchantLoading,
  MerchantScreen,
  MerchantSection,
  ui,
} from "../../components/MerchantUi";
import { MenuItemEditor } from "../../components/MenuItemEditor";
import { useSession } from "../../lib/session-context";
import {
  useDeleteMenuItem,
  useMerchantMenu,
  useSaveMenuItem,
  useSetMenuItemAvailable,
  type MerchantMenuItem,
} from "../../lib/merchant";
import { colors, radius, spacing, type } from "../../lib/theme";

/**
 * The restaurant's menu: add an item with a photo, tap one to edit it, or flip
 * its switch when it sells out.
 */
export default function MerchantMenuScreen() {
  const { role } = useSession();
  const restaurantId = role?.restaurantId ?? null;
  const restaurant = restaurantId
    ? { id: restaurantId, name: role?.restaurantName ?? null }
    : null;
  const menu = useMerchantMenu(restaurantId);
  const toggle = useSetMenuItemAvailable(restaurantId);
  const save = useSaveMenuItem(restaurant);
  const remove = useDeleteMenuItem(restaurantId);
  // undefined: editor closed; null: adding a new item; an item: editing it.
  const [editing, setEditing] = useState<MerchantMenuItem | null | undefined>(
    undefined
  );

  if (menu.isPending) return <MerchantLoading message="Loading menu…" />;

  const items = menu.data ?? [];
  const live = items.filter((i) => i.available).length;
  const byCategory = new Map<string, MerchantMenuItem[]>();
  for (const item of items) {
    byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
  }
  const categories = [...byCategory.keys()];

  return (
    <MerchantScreen
      title="Menu"
      subtitle={`${live} of ${items.length} items customers can order`}
      refreshing={menu.isRefetching}
      onRefresh={() => void menu.refetch()}
    >
      <View style={styles.addRow}>
        <MerchantButton label="+ Add menu item" onPress={() => setEditing(null)} />
      </View>

      {menu.isError ? (
        <Text style={ui.error}>Could not load the menu. Pull down to retry.</Text>
      ) : null}
      {toggle.isError || remove.isError ? (
        <Text style={ui.error}>That change was not saved. Try again.</Text>
      ) : null}
      {items.length === 0 && !menu.isError ? (
        <Text style={ui.muted}>No menu items yet. Add your first dish above.</Text>
      ) : null}

      {[...byCategory.entries()].map(([category, rows]) => (
        <MerchantSection key={category} label={category}>
          {rows.map((item) => {
            const saving = toggle.isPending && toggle.variables?.id === item.id;
            const available = saving ? !!toggle.variables?.available : item.available;
            return (
              <View key={item.id} style={styles.row}>
                <Pressable
                  style={styles.tap}
                  onPress={() => setEditing(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${item.name}`}
                >
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <Text style={styles.thumbHint}>No photo</Text>
                    </View>
                  )}
                  <View style={styles.copy}>
                    <Text style={[ui.body, !available && styles.off]}>{item.name}</Text>
                    <Text style={ui.muted}>
                      ₱{item.price.toFixed(2)} · {available ? "Available" : "Sold out"}
                    </Text>
                  </View>
                </Pressable>
                <Switch
                  value={available}
                  disabled={saving}
                  onValueChange={(next) =>
                    toggle.mutate({ id: item.id, available: next })
                  }
                  trackColor={{ true: colors.primary, false: colors.border }}
                  accessibilityLabel={`${item.name} available`}
                />
              </View>
            );
          })}
        </MerchantSection>
      ))}

      {editing !== undefined ? (
        <MenuItemEditor
          // A fresh editor per open, so its fields start from this item.
          key={editing?.id ?? "new"}
          visible
          item={editing}
          restaurantId={restaurantId}
          categories={categories}
          saving={save.isPending}
          onSave={async (input) => {
            await save.mutateAsync({ id: editing?.id ?? null, input });
            setEditing(undefined);
          }}
          onDelete={
            editing
              ? () => {
                  remove.mutate(editing.id);
                  setEditing(undefined);
                }
              : null
          }
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </MerchantScreen>
  );
}

const styles = StyleSheet.create({
  addRow: { flexDirection: "row" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  tap: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  copy: { flex: 1, gap: 2 },
  off: { ...type.body, color: colors.textFaint },
  thumb: { width: 52, height: 52, borderRadius: radius.md },
  thumbEmpty: {
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbHint: { fontSize: 9, color: colors.textFaint },
});
