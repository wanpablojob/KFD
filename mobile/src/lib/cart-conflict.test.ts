import { INITIAL, reducer, type CartState } from "./cart-context";
import { countLines, type CartLine } from "./cart-logic";

/**
 * The cart-conflict flow, end to end through the reducer the screen actually
 * uses. Pure cart maths is covered in cart-logic.test.ts; what matters here is
 * that the customer's choices are respected and nothing is lost or duplicated
 * behind their back.
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
  it("holds the line instead of dropping it, and leaves the cart alone", () => {
    const before = cartAtJollibee();
    const after = reducer(before, { type: "add", line: mcdonalds("burger") });

    expect(after.pending?.line.menu_item_id).toBe("burger");
    expect(after.lines).toEqual(before.lines);
    expect(countLines(after.lines)).toBe(2);
  });

  it("records what clearing would cost the customer", () => {
    const after = reducer(cartAtJollibee(), { type: "add", line: mcdonalds("burger") });
    expect(after.pending?.previousRestaurantName).toBe("Jollibee");
    expect(after.pending?.previousItemCount).toBe(2);
  });

  it("moves the question to the newest item if they tap ADD elsewhere", () => {
    const asked = reducer(cartAtJollibee(), { type: "add", line: mcdonalds("burger") });
    const moved = reducer(asked, { type: "add", line: mcdonalds("fries") });

    expect(moved.pending?.line.menu_item_id).toBe("fries");
    expect(moved.lines).toEqual(asked.lines);
  });
});

describe("KEEP CART", () => {
  it("drops the held line and keeps the cart exactly as it was", () => {
    const before = cartAtJollibee();
    const asked = reducer(before, { type: "add", line: mcdonalds("burger") });
    const kept = reducer(asked, { type: "dismissPending" });

    expect(kept.pending).toBeNull();
    expect(kept.lines).toEqual(before.lines);
  });
});

describe("CLEAR & ADD", () => {
  it("replaces the cart with the held line", () => {
    const asked = reducer(cartAtJollibee(), { type: "add", line: mcdonalds("burger") });
    const swapped = reducer(asked, { type: "acceptPending" });

    expect(swapped.pending).toBeNull();
    expect(swapped.lines).toHaveLength(1);
    expect(swapped.lines[0].menu_item_id).toBe("burger");
    expect(swapped.lines[0].quantity).toBe(1);
    expect(swapped.lines[0].restaurantName).toBe("McDonalds");
  });

  it("leaves the new cart able to accept more from the same restaurant", () => {
    const asked = reducer(cartAtJollibee(), { type: "add", line: mcdonalds("burger") });
    const swapped = reducer(asked, { type: "acceptPending" });
    const more = reducer(swapped, { type: "add", line: mcdonalds("fries") });

    expect(more.pending).toBeNull();
    expect(more.lines.map((l) => l.menu_item_id)).toEqual(["burger", "fries"]);
  });
});

describe("no stale question", () => {
  it("clears a held line once the customer adds normally again", () => {
    const asked = reducer(cartAtJollibee(), { type: "add", line: mcdonalds("burger") });
    const resolved = reducer(asked, { type: "dismissPending" });
    const added = reducer(resolved, { type: "add", line: jollibee("b") });

    expect(added.pending).toBeNull();
    expect(added.lines.map((l) => l.menu_item_id)).toEqual(["a", "b"]);
  });

  it("ignores accept and dismiss when nothing is held", () => {
    const clean = cartAtJollibee();
    expect(reducer(clean, { type: "acceptPending" })).toBe(clean);
    expect(reducer(clean, { type: "dismissPending" }).lines).toEqual(clean.lines);
  });

  it("empties cart and held line together", () => {
    const asked = reducer(cartAtJollibee(), { type: "add", line: mcdonalds("burger") });
    expect(reducer(asked, { type: "clear" })).toEqual(INITIAL);
  });
});
