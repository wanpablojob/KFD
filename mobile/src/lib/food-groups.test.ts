import { dishesByGroup, foodGroupOf } from "./food-groups";

describe("foodGroupOf", () => {
  it("uses the shop's category first", () => {
    expect(foodGroupOf("Matcha", "Creamy Matcha (S)")).toBe("coffee");
    expect(foodGroupOf("Iced Coffee", "Spanish Latte (Regular)")).toBe("coffee");
    expect(foodGroupOf("Non-Coffee", "Ube Milk (Large)")).toBe("drinks");
    expect(foodGroupOf("Frappe (16 oz)", "Java Chip Frappe (Cream Base)")).toBe(
      "drinks"
    );
    expect(foodGroupOf("Pastries", "Leche Flan")).toBe("desserts");
    expect(foodGroupOf("Sizzlers", "Sizzling Tapa")).toBe("sizzling");
    expect(foodGroupOf("Inasal (Unli Rice)", "Unli Rice Paa")).toBe("grill");
    expect(foodGroupOf("Value Meals", "Liempo Meal")).toBe("rice");
    expect(foodGroupOf("Pizza", "Truffle Pizza")).toBe("pasta");
    expect(foodGroupOf("Soup & Noodles", "Beef Bulalo")).toBe("noodles");
    expect(foodGroupOf("Salad", "Garden Salad with Grilled Chicken")).toBe("salads");
  });

  it("falls back to the dish name when the category says nothing", () => {
    expect(foodGroupOf("A La Carte", "Grilled Bangus (Large)")).toBe("seafood");
    expect(foodGroupOf("Others", "Calamares")).toBe("seafood");
  });

  it("matches whole words only", () => {
    // "steak" must not count as "tea".
    expect(foodGroupOf("Beef", "Sizzling Beef Steak (Single)")).toBe("mains");
  });

  it("leaves out add-ons, extras and plain rice", () => {
    expect(foodGroupOf("Add-ons", "Oat Milk (S)")).toBeNull();
    expect(foodGroupOf("Drink Extras", "Whipped Cream")).toBeNull();
    expect(foodGroupOf("Rice", "Plain Rice")).toBeNull();
    expect(foodGroupOf("Others", "Rice")).toBeNull();
  });
});

describe("dishesByGroup", () => {
  it("folds sizes into one dish at the lowest price, open shops first", () => {
    const row = (
      id: string,
      rid: string,
      name: string,
      price: number,
      category = "Matcha"
    ) => ({
      id,
      restaurant_id: rid,
      restaurant: rid === "open" ? "Open Cafe" : "Closed Cafe",
      name,
      price,
      category,
      image_url: null,
    });
    const groups = dishesByGroup(
      [
        row("1", "closed", "Matcha Latte", 99),
        row("2", "open", "Creamy Matcha (S)", 105),
        row("3", "open", "Creamy Matcha (M)", 120),
        row("4", "open", "Oat Milk (S)", 20, "Add-ons"),
      ],
      new Set(["open"])
    );
    const coffee = groups.get("coffee") ?? [];
    expect(coffee.map((d) => [d.name, d.price, d.hasSizes])).toEqual([
      ["Creamy Matcha", 105, true],
      ["Matcha Latte", 99, false],
    ]);
    expect([...groups.keys()]).toEqual(["coffee"]);
  });
});
