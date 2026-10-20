import {
  MAX_QUANTITY,
  addLine,
  cartFingerprint,
  checkoutNonce,
  checkoutRequestId,
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

describe("quantity cap (mirrors customer_place_order, 0076)", () => {
  it("stops incrementing at the cap", () => {
    const full = setQuantity([{ ...item("a"), quantity: 1 }], "a", MAX_QUANTITY);
    const r = addLine(full, item("a"));
    expect(r.lines[0].quantity).toBe(MAX_QUANTITY);
  });

  it("clamps a typed quantity above the cap", () => {
    const lines = setQuantity([{ ...item("a"), quantity: 1 }], "a", MAX_QUANTITY + 25);
    expect(lines[0].quantity).toBe(MAX_QUANTITY);
  });
});

/**
 * The checkout key. What matters is the pair of properties the server relies
 * on: a retry of one cart reuses the key, and a changed cart cannot.
 */
describe("checkout idempotency key", () => {
  const cart = (quantity = 2, price = 120): CartLine[] => [
    {
      menu_item_id: "m1",
      name: "Adobo",
      price,
      quantity,
      restaurantId: "r1",
      restaurantName: "KFD Kitchen",
    },
    {
      menu_item_id: "m2",
      name: "Halo-halo",
      price: 90,
      quantity: 1,
      restaurantId: "r1",
      restaurantName: "KFD Kitchen",
    },
  ];

  it("fingerprints contents, not the order the lines were added", () => {
    const forward = cart();
    const backward = [...forward].reverse();
    expect(cartFingerprint(forward)).toBe(cartFingerprint(backward));
  });

  it("changes when a quantity or a price changes", () => {
    const base = cartFingerprint(cart());
    expect(cartFingerprint(cart(3))).not.toBe(base);
    expect(cartFingerprint(cart(2, 125))).not.toBe(base);
  });

  it("is stable for a retry of the same cart", () => {
    const nonce = checkoutNonce();
    expect(checkoutRequestId(nonce, cart())).toBe(checkoutRequestId(nonce, cart()));
  });

  it("changes after the cart is cleared and rebuilt", () => {
    expect(checkoutRequestId(checkoutNonce(), cart())).not.toBe(
      checkoutRequestId(checkoutNonce(), cart())
    );
  });

  it("stays inside the server's 8-64 character window for a big cart", () => {
    const big = Array.from({ length: 30 }, (_, i) => ({
      menu_item_id: `menu-item-${i}-with-a-long-identifier`,
      name: `Item ${i}`,
      price: 999.99,
      quantity: 50,
      restaurantId: "restaurant-with-a-long-id",
      restaurantName: "Kitchen",
    }));
    const key = checkoutRequestId(checkoutNonce(), big);
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(key.length).toBeLessThanOrEqual(64);
  });
});
