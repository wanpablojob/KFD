/**
 * Turn a past order's lines back into cart lines against today's menu.
 *
 * Reorder is where the past order and the current menu have to agree, and they
 * often do not: an item may have been removed, renamed, or re-priced. Rather
 * than fail the whole reorder on one missing item, this returns the lines it
 * could rebuild and names the ones it could not, so the customer sees what
 * changed instead of a cart that quietly differs from their last order.
 *
 * Matching is by menu_item_id when the order recorded one (orders placed from
 * migration 0053 onward), falling back to an exact, case-insensitive name match
 * for older orders. Price always comes from the current menu, never the old
 * order: the number they are about to be charged is the one on the menu today.
 */
import type { MenuItemRow } from "./storefront";

/** The subset of an order line reorder cares about. price is ignored on purpose. */
export interface ReorderSourceItem {
  name: string;
  quantity: number;
  menu_item_id?: string | null;
}

export interface ReorderLine {
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface ReorderResult {
  lines: ReorderLine[];
  /** Names from the past order that are no longer on the menu. */
  unavailable: string[];
}

export function buildReorder(
  orderItems: readonly ReorderSourceItem[],
  menu: readonly MenuItemRow[]
): ReorderResult {
  const byId = new Map(menu.map((m) => [m.id, m]));
  const byName = new Map(menu.map((m) => [m.name.trim().toLowerCase(), m]));

  const lines: ReorderLine[] = [];
  const unavailable: string[] = [];

  for (const item of orderItems) {
    if (typeof item?.name !== "string" || !(item.quantity > 0)) continue;

    const match =
      (item.menu_item_id ? byId.get(item.menu_item_id) : undefined) ??
      byName.get(item.name.trim().toLowerCase());

    if (!match) {
      unavailable.push(item.name);
      continue;
    }

    lines.push({
      menu_item_id: match.id,
      name: match.name,
      price: match.price,
      quantity: item.quantity,
    });
  }

  return { lines, unavailable };
}
