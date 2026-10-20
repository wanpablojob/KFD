import { INITIAL, reducer, type CartState } from "./cart-context";
import { countLines, shopCountOf, type CartLine } from "./cart-logic";

/**
 * The cart state, end to end through the reducer the screen actually uses.
 * Pure cart maths is covered in cart-logic.test.ts; what matters here is that
 * a basket holding food from several kitchens keeps all of it, and that
 * nothing the customer chose is lost or duplicated behind their back.
 *
 * The old flow asked "your cart has items from another place, start a new
 * cart?". That is gone (0092): one basket can hold ten kitchens, and one
 * rider collects them all.
 */

const line = (
  menu_item_id: string,
  restaurantId: string,
  restaurantName: string
): Omit<CartLine, "quantity"> => ({
  menu_item_id,
  name: `Item ${menu_item_id}`,
  price: 100,
  restaurantId,
  restaurantName,
});

const jollibee = (id: string) => line(id, "r1", "Jollibee");
const mcdonalds = (id: string) => line(id, "r2", "McDonalds");

/** A cart holding two units of one Jollibee item. */
const cartAtJollibee = (): CartState => {
  let s = reducer(INITIAL, { type: "add", line: jollibee("a") });
  s = reducer(s, { type: "add", line: jollibee("a") });
  return s;
};

describe("adding from a second restaurant", () => {
  it("keeps both shops' food in the basket", () => {
    const after = reducer(cartAtJollibee(), {
      type: "add",
      line: mcdonalds("burger"),
    });

    expect(after.lines).toHaveLength(2);
    expect(shopCountOf(after.lines)).toBe(2);
    // The Jollibee items are untouched.
    expect(countLines(after.lines)).toBe(3);
  });

  it("does not ask the customer to start a new cart", () => {
    const after = reducer(cartAtJollibee(), {
      type: "add",
      line: mcdonalds("burger"),
    });
    expect(Object.keys(after)).toEqual(["lines"]);
  });
});

describe("editing the basket", () => {
  it("removes one shop's line and keeps the other", () => {
    let s = reducer(cartAtJollibee(), {
      type: "add",
      line: mcdonalds("burger"),
    });
    s = reducer(s, { type: "remove", menu_item_id: "burger" });
    expect(shopCountOf(s.lines)).toBe(1);
    expect(countLines(s.lines)).toBe(2);
  });

  it("replaces the whole basket, for a reorder", () => {
    const s = reducer(cartAtJollibee(), {
      type: "replace",
      lines: [{ ...mcdonalds("fries"), quantity: 1 }],
    });
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0].menu_item_id).toBe("fries");
  });

  it("empties the basket on clear", () => {
    const s = reducer(cartAtJollibee(), { type: "clear" });
    expect(s.lines).toEqual([]);
  });

  it("restores a basket from disk, shops and all", () => {
    const stored: CartLine[] = [
      { ...jollibee("a"), quantity: 1 },
      { ...mcdonalds("burger"), quantity: 2 },
    ];
    const s = reducer(INITIAL, { type: "hydrate", lines: stored });
    expect(s.lines).toEqual(stored);
    expect(shopCountOf(s.lines)).toBe(2);
  });
});
