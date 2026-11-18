/**
 * One dish per card, however many sizes it comes in.
 *
 * A size is its own menu item named "Dish (Size)" -- "Creamy Matcha (S)",
 * "(M)", "(L)" -- so the menu listed every size as a near-duplicate row, and a
 * customer could tap the first one without knowing the others existed. Grouping
 * here turns them back into one dish whose ADD asks for a size.
 *
 * Only items in the same category that share a base name AND each carry a
 * "(…)" suffix are grouped, and only when there are at least two of them, so
 * "Pork Siomai (5 pcs)" on its own stays a plain item.
 */

export interface SizedRow {
  id: string;
  name: string;
  price: number;
  category: string | null;
}

export interface Dish<T extends SizedRow> {
  /** Stable key for lists: the first size's id. */
  key: string;
  /** The base name, without the size. */
  name: string;
  /** One entry per size, in menu order. `label` is null for an unsized item. */
  sizes: { label: string | null; row: T }[];
}

const SIZE_SUFFIX = /^(.*\S)\s*\(([^()]+)\)$/;

export function groupSizes<T extends SizedRow>(rows: readonly T[]): Dish<T>[] {
  const keyOf = (row: T) => {
    const m = SIZE_SUFFIX.exec(row.name.trim());
    return m ? { base: m[1], label: m[2].trim() } : null;
  };

  // How many rows share each category + base name.
  const counts = new Map<string, number>();
  for (const row of rows) {
    const k = keyOf(row);
    if (!k) continue;
    const id = `${row.category ?? ""}\u0000${k.base.toLowerCase()}`;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const dishes: Dish<T>[] = [];
  const byGroup = new Map<string, Dish<T>>();
  for (const row of rows) {
    const k = keyOf(row);
    const id = k ? `${row.category ?? ""}\u0000${k.base.toLowerCase()}` : null;
    if (k && id && (counts.get(id) ?? 0) >= 2) {
      const existing = byGroup.get(id);
      if (existing) {
        existing.sizes.push({ label: k.label, row });
      } else {
        const dish = { key: row.id, name: k.base, sizes: [{ label: k.label, row }] };
        byGroup.set(id, dish);
        dishes.push(dish);
      }
    } else {
      dishes.push({ key: row.id, name: row.name, sizes: [{ label: null, row }] });
    }
  }
  return dishes;
}
