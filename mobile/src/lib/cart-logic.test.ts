import {
  MAX_QUANTITY,
  MAX_SHOPS,
  addLine,
  cartFingerprint,
  checkoutNonce,
  checkoutRequestId,
  countLines,
  feeBreakdown,
  groupByRestaurant,
  isFullCart,
  removeLine,
  setQuantity,
  shopCountOf,
  subtotalOf,
  toShopPayload,
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

  // A basket may hold food from several kitchens now: one rider collects from
  // all of them and delivers it in one trip (0092).
  it("allows a line from ANOTHER restaurant", () => {
    const first = addLine([], item("a", "r1"));
    if (first.kind !== "added") throw new Error("setup");
    const second = addLine(first.lines, item("b", "r2"));
    expect(second.kind).toBe("added");
    if (second.kind !== "added") throw new Error("wrong kind");
    expect(second.lines).toHaveLength(2);
    expect(shopCountOf(second.lines)).toBe(2);
  });

  it("refuses an eleventh shop, and says so", () => {
    let lines: CartLine[] = [];
    for (let i = 0; i < MAX_SHOPS; i++) {
      const r = addLine(lines, item(`m${i}`, `r${i}`));
      if (r.kind !== "added") throw new Error("setup");
      lines = r.lines;
    }
    expect(shopCountOf(lines)).toBe(MAX_SHOPS);
    expect(isFullCart(lines)).toBe(true);

    const blocked = addLine(lines, item("m10", "r10"));
    expect(blocked.kind).toBe("too_many_shops");
    if (blocked.kind !== "too_many_shops") throw new Error("wrong kind");
    expect(blocked.shopCount).toBe(MAX_SHOPS);
    // The basket is left as it was, so nothing the customer chose is lost.
    expect(blocked.lines).toEqual(lines);
  });

  it("still allows another line from a shop already in the basket", () => {
    let lines: CartLine[] = [];
    for (let i = 0; i < MAX_SHOPS; i++) {
      const r = addLine(lines, item(`m${i}`, `r${i}`));
      if (r.kind !== "added") throw new Error("setup");
      lines = r.lines;
    }
    const same = addLine(lines, item("another", "r3"));
    expect(same.kind).toBe("added");
  });
});

/**
 * The checkout groups the basket by shop, so the customer can see what they
 * bought from each kitchen and what it came to.
 */
describe("grouping the cart by shop", () => {
  const lines: CartLine[] = [
    { ...item("a", "r1"), quantity: 2, price: 100 },
    { ...item("b", "r1"), quantity: 1, price: 50 },
    { ...item("c", "r2"), quantity: 3, price: 80 },
  ];

  it("keeps one group per shop, in the order the shops were added", () => {
    const shops = groupByRestaurant(lines);
    expect(shops).toHaveLength(2);
    expect(shops[0].restaurantId).toBe("r1");
    expect(shops[1].restaurantId).toBe("r2");
  });

  it("gives each shop its own lines, count and subtotal", () => {
    const shops = groupByRestaurant(lines);
    expect(shops[0].lines).toHaveLength(2);
    expect(shops[0].count).toBe(3);
    expect(shops[0].subtotal).toBe(250);
    expect(shops[1].count).toBe(3);
    expect(shops[1].subtotal).toBe(240);
  });

  it("names the shop", () => {
    expect(groupByRestaurant(lines)[0].restaurantName).toBe("Jollibee");
  });

  it("is empty for an empty cart", () => {
    expect(groupByRestaurant([])).toEqual([]);
    expect(shopCountOf([])).toBe(0);
    expect(isFullCart([])).toBe(false);
  });

  it("sends the server one entry per shop, each with its lines", () => {
    const payload = toShopPayload(lines);
    expect(payload).toHaveLength(2);
    expect(payload[0].restaurant_id).toBe("r1");
    expect(payload[0].items).toEqual([
      { menu_item_id: "a", quantity: 2 },
      { menu_item_id: "b", quantity: 1 },
    ]);
    expect(payload[1].items).toEqual([{ menu_item_id: "c", quantity: 3 }]);
  });
});

/**
 * The fee the customer is shown: the destination's own rate, plus 10.00 for
 * every shop after the first, and one service fee for the whole trip (0092).
 */
describe("the delivery fee breakdown", () => {
  it("is just the rate for one shop", () => {
    const fees = feeBreakdown({
      shop_count: 1,
      base_delivery_fee: 30,
      delivery_fee: 30,
      service_fee: 5,
      total: 135,
    });
    expect(fees.base).toBe(30);
    expect(fees.extraShops).toBe(0);
    expect(fees.extraShopFee).toBe(0);
    expect(fees.deliveryFee).toBe(30);
    expect(fees.serviceFee).toBe(5);
    expect(fees.total).toBe(135);
    expect(fees.feeAgreedInPerson).toBe(false);
  });

  it("adds the extra-shop charge for three shops", () => {
    const fees = feeBreakdown({
      shop_count: 3,
      base_delivery_fee: 30,
      delivery_fee: 50,
      service_fee: 5,
      total: 355,
    });
    expect(fees.extraShops).toBe(2);
    expect(fees.extraShopFee).toBe(10);
    expect(fees.deliveryFee).toBe(50);
    expect(fees.total).toBe(355);
  });

  it("keeps the service fee at one for the whole checkout", () => {
    const fees = feeBreakdown({
      shop_count: 10,
      base_delivery_fee: 30,
      delivery_fee: 120,
      service_fee: 5,
      total: 1125,
    });
    expect(fees.extraShops).toBe(9);
    expect(fees.extraShopFee).toBe(10);
    expect(fees.serviceFee).toBe(5);
  });

  it("says when the fee is settled with the rider at the door", () => {
    const fees = feeBreakdown({
      shop_count: 2,
      base_delivery_fee: 0,
      delivery_fee: 10,
      service_fee: 5,
      total: 215,
      fee_agreed_in_person: true,
    });
    expect(fees.feeAgreedInPerson).toBe(true);
    // The rate is not in the total, but the extra-shop charge is a known price.
    expect(fees.base).toBe(0);
    expect(fees.deliveryFee).toBe(10);
    expect(fees.extraShopFee).toBe(10);
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
