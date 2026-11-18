import { groupSizes } from "./menu-sizes";

const row = (id: string, name: string, price: number, category = "Matcha") => ({
  id,
  name,
  price,
  category,
});

describe("groupSizes", () => {
  it("folds the sizes of one dish into a single entry, in menu order", () => {
    const dishes = groupSizes([
      row("a", "Creamy Matcha (S)", 105),
      row("b", "Creamy Matcha (M)", 120),
      row("c", "Creamy Matcha (L)", 135),
      row("d", "Creamy Egg Matcha (M)", 149),
    ]);
    expect(dishes.map((d) => d.name)).toEqual([
      "Creamy Matcha",
      "Creamy Egg Matcha (M)",
    ]);
    expect(dishes[0].sizes.map((s) => [s.label, s.row.price])).toEqual([
      ["S", 105],
      ["M", 120],
      ["L", 135],
    ]);
  });

  it("leaves a lone item with brackets alone", () => {
    const dishes = groupSizes([row("a", "Pork Siomai (5 pcs)", 79, "Quick Bites")]);
    expect(dishes).toEqual([
      {
        key: "a",
        name: "Pork Siomai (5 pcs)",
        sizes: [{ label: null, row: dishes[0].sizes[0].row }],
      },
    ]);
  });

  it("does not merge the same name across categories", () => {
    const dishes = groupSizes([
      row("a", "Shawarma Wrap (Solo)", 95, "Shawarma"),
      row("b", "Shawarma Wrap (Buy 1 Take 1)", 170, "Promos"),
    ]);
    expect(dishes).toHaveLength(2);
    expect(dishes.every((d) => d.sizes[0].label === null)).toBe(true);
  });

  it("keeps an unsized item with the same base name as its own dish", () => {
    const dishes = groupSizes([
      row("a", "Iced Tea", 45, "Drinks"),
      row("b", "Iced Tea (Glass)", 45, "Drinks"),
      row("c", "Iced Tea (Pitcher)", 110, "Drinks"),
    ]);
    expect(dishes.map((d) => [d.name, d.sizes.length])).toEqual([
      ["Iced Tea", 1],
      ["Iced Tea", 2],
    ]);
  });
});
