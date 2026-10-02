import {
  addLine,
  countLines,
  removeLine,
  restaurantNameOf,
  restaurantOf,
  setQuantity,
  subtotalOf,
} from "./cart-logic";
import type { CartLine } from "./cart-logic";

const item = (
  menu_item_id: string,
  restaurantId = "r1"
): Omit<CartLine, "quantity"> => ({
  menu_item_id,
  name: `Item ${menu_item_id}`,
  price: 100,
  restaurantId,
  restaurantName: restaurantId === "r1" ? "Jollibee" : "McDonalds",
});

describe("addLine", () => {
  it("adds a new line as quantity 1", () => {
    const r = addLine([], item("a"));
    expect(r.kind).toBe("added");
    if (r.kind !== "added") throw new Error("wrong kind");
    expect(r.lines[0].quantity).toBe(1);
  });

  it("increments instead of duplicating an existing menu item", () => {
    const first = addLine([], item("a"));
    if (first.kind !== "added") throw new Error("setup");
    const second = addLine(first.lines, item("a"));
    expect(second.kind).toBe("merged");
    if (second.kind !== "merged") throw new Error("wrong kind");
    expect(second.lines).toHaveLength(1);
    expect(second.lines[0].quantity).toBe(2);
  });

  it("allows a second line from the SAME restaurant", () => {
    const r = addLine([], item("a", "r1"));
    if (r.kind !== "added") throw new Error("setup");
    const second = addLine(r.lines, item("b", "r1"));
    expect(second.kind).toBe("added");
  });

  // This is the bug: the old add() returned `prev` untouched here, so the tap
  // looked broken and only checkout ever explained why.
  it("reports other_restaurant instead of silently dropping the line", () => {
    const first = addLine([], item("a", "r1"));
    if (first.kind !== "added") throw new Error("setup");
    const second = addLine(first.lines, item("b", "r2"));
    expect(second.kind).toBe("other_restaurant");
    if (second.kind !== "other_restaurant") throw new Error("wrong kind");
    expect(second.pending.menu_item_id).toBe("b");
    expect(second.lines).toHaveLength(1);
  });

  it("leaves the cart untouched while the conflict is unresolved", () => {
    const first = addLine([], item("a", "r1"));
    if (first.kind !== "added") throw new Error("setup");
    const blocked = addLine(first.lines, item("b", "r2"));
    if (blocked.kind !== "other_restaurant") throw new Error("wrong kind");
    // Nothing was written, so a customer who backs out gets the cart they had.
    expect(blocked.lines).toEqual(first.lines);
  });

  // The confirm is destructive, so it has to say what it destroys.
  it("names the restaurant and item count that clearing would discard", () => {
    const first = addLine([], item("a", "r1"));
    if (first.kind !== "added") throw new Error("setup");
    const twice = addLine(first.lines, item("a", "r1"));
    if (twice.kind !== "merged") throw new Error("setup");
    const blocked = addLine(twice.lines, item("b", "r2"));
    if (blocked.kind !== "other_restaurant") throw new Error("wrong kind");
    expect(blocked.previousRestaurantName).toBe("Jollibee");
    expect(blocked.previousItemCount).toBe(2);
    expect(blocked.pending.restaurantName).toBe("McDonalds");
  });
});

describe("restaurant of the cart", () => {
  const one: CartLine = { ...item("a", "r1"), quantity: 2 };

  it("is null for an empty cart", () => {
    expect(restaurantOf([])).toBeNull();
    expect(restaurantNameOf([])).toBeNull();
  });

  it("reads off the first line", () => {
    expect(restaurantOf([one])).toBe("r1");
    expect(restaurantNameOf([one])).toBe("Jollibee");
  });
});

describe("quantity edits", () => {
  const one: CartLine = { ...item("a"), quantity: 2 };

  it("sets an explicit quantity", () => {
    expect(setQuantity([one], "a", 5)[0].quantity).toBe(5);
  });

  it("removes the line at zero or below", () => {
    expect(setQuantity([one], "a", 0)).toHaveLength(0);
    expect(setQuantity([one], "a", -1)).toHaveLength(0);
  });

  it("removes by id", () => {
    expect(removeLine([one], "a")).toHaveLength(0);
  });

  it("counts units, not lines", () => {
    expect(countLines([one, { ...item("b"), quantity: 3 }])).toBe(5);
  });

  it("sums price times quantity", () => {
    // 100x2 + 100x3
    expect(subtotalOf([one, { ...item("b"), quantity: 3 }])).toBe(500);
  });
});
