import { StyleSheet, Switch, Text, View } from "react-native";
import {
  MerchantLoading,
  MerchantScreen,
  MerchantSection,
  ui,
} from "../../components/MerchantUi";
import { useSession } from "../../lib/session-context";
import {
  useMerchantMenu,
  useSetMenuItemAvailable,
  type MerchantMenuItem,
} from "../../lib/merchant";
import { colors, spacing, type } from "../../lib/theme";

/**
 * Sold out or back in stock, in one tap. Adding items, prices and photos stays
 * on the web portal for now, where uploading and typing are easier.
 */
export default function MerchantMenuScreen() {
  const { role } = useSession();
  const restaurantId = role?.restaurantId ?? null;
  const menu = useMerchantMenu(restaurantId);
  const toggle = useSetMenuItemAvailable(restaurantId);

  if (menu.isPending) return <MerchantLoading message="Loading menu…" />;

  const items = menu.data ?? [];
  const live = items.filter((i) => i.available).length;
  const byCategory = new Map<string, MerchantMenuItem[]>();
  for (const item of items) {
    byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
  }

  return (
    <MerchantScreen
      title="Menu"
      subtitle={`${live} of ${items.length} items customers can order`}
      refreshing={menu.isRefetching}
      onRefresh={() => void menu.refetch()}
    >
      {menu.isError ? (
        <Text style={ui.error}>Could not load the menu. Pull down to retry.</Text>
      ) : null}
      {toggle.isError ? (
        <Text style={ui.error}>That change was not saved. Try again.</Text>
      ) : null}
      {items.length === 0 && !menu.isError ? (
        <Text style={ui.muted}>
          No menu items yet. Add them from the KFD merchant portal on the web.
        </Text>
      ) : null}

      {[...byCategory.entries()].map(([category, rows]) => (
        <MerchantSection key={category} label={category}>
          {rows.map((item) => {
            const saving = toggle.isPending && toggle.variables?.id === item.id;
            const available = saving ? !!toggle.variables?.available : item.available;
            return (
              <View key={item.id} style={styles.row}>
                <View style={styles.copy}>
                  <Text style={[ui.body, !available && styles.off]}>{item.name}</Text>
                  <Text style={ui.muted}>
                    ₱{item.price.toFixed(2)} · {available ? "Available" : "Sold out"}
                  </Text>
                </View>
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
    </MerchantScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  copy: { flex: 1, gap: 2 },
  off: { ...type.body, color: colors.textFaint },
});
