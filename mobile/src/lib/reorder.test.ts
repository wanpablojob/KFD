import { buildReorder } from "./reorder";
import type { MenuItemRow } from "./storefront";

function menuItem(
  id: string,
  name: string,
  price: number,
  extra: Partial<MenuItemRow> = {}
): MenuItemRow {
  return {
    id,
    name,
    price,
    restaurant: "Test Kitchen",
    restaurant_id: "r1",
    category: "Mains",
    available: true,
    ...extra,
  };
}

describe("buildReorder", () => {
  it("rebuilds lines by menu_item_id, taking today's price", () => {
    const result = buildReorder(
      [{ name: "Old Name", quantity: 2, menu_item_id: "m1" }],
      [menuItem("m1", "New Name", 60)]
    );
    expect(result.lines).toEqual([
      { menu_item_id: "m1", name: "New Name", price: 60, quantity: 2 },
    ]);
    expect(result.unavailable).toEqual([]);
  });

  it("falls back to a case-insensitive name match for pre-0053 orders", () => {
    const result = buildReorder(
      [{ name: "chicken adobo", quantity: 1 }],
      [menuItem("m1", "Chicken Adobo", 80)]
    );
    expect(result.lines).toEqual([
      { menu_item_id: "m1", name: "Chicken Adobo", price: 80, quantity: 1 },
    ]);
  });

  it("reports items that are no longer on the menu", () => {
    const result = buildReorder(
      [
        { name: "Gone", quantity: 1 },
        { name: "Still here", quantity: 1 },
      ],
      [menuItem("m1", "Still here", 50)]
    );
    expect(result.unavailable).toEqual(["Gone"]);
    expect(result.lines.map((l) => l.name)).toEqual(["Still here"]);
  });

  it("ignores lines with a non-positive quantity", () => {
    const result = buildReorder(
      [{ name: "Zero", quantity: 0 }],
      [menuItem("m1", "Zero", 10)]
    );
    expect(result.lines).toEqual([]);
    expect(result.unavailable).toEqual([]);
  });

  it("returns nothing when everything is gone", () => {
    const result = buildReorder([{ name: "Gone", quantity: 1 }], []);
    expect(result.lines).toEqual([]);
    expect(result.unavailable).toEqual(["Gone"]);
  });
});
