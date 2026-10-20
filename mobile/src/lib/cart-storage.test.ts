import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  cartStorageKey,
  loadCart,
  parseStoredCart,
  removeCart,
  saveCart,
} from "./cart-storage";
import type { CartLine } from "./cart-logic";
import { MAX_SHOPS } from "./cart-logic";

/**
 * The cart on disk. The failure this guards against is silent: a cart that
 * comes back empty, or worse, one that comes back with a price the customer
 * never saw.
 */

const line = (over: Partial<CartLine> = {}): CartLine => ({
  menu_item_id: "m1",
  name: "Adobo",
  price: 120,
  quantity: 2,
  restaurantId: "r1",
  restaurantName: "KFD Kitchen",
  ...over,
});

const nonce = "nonce12345";

describe("parseStoredCart", () => {
  it("round-trips a cart it wrote", () => {
    const stored = JSON.stringify({ nonce, lines: [line()] });
    expect(parseStoredCart(stored)).toEqual({ nonce, lines: [line()] });
  });

  it("returns null for nothing stored", () => {
    expect(parseStoredCart(null)).toBeNull();
  });

  it("returns null rather than repairing unreadable JSON", () => {
    expect(parseStoredCart("{not json")).toBeNull();
    expect(parseStoredCart('"a string"')).toBeNull();
    expect(parseStoredCart("42")).toBeNull();
  });

  it("rejects an empty cart and a missing nonce", () => {
    expect(parseStoredCart(JSON.stringify({ nonce, lines: [] }))).toBeNull();
    expect(parseStoredCart(JSON.stringify({ lines: [line()] }))).toBeNull();
    expect(
      parseStoredCart(JSON.stringify({ nonce: "short", lines: [line()] }))
    ).toBeNull();
  });

  it("rejects a line with a price or quantity the checkout cannot trust", () => {
    for (const bad of [
      { price: "120" },
      { price: -1 },
      { price: Number.NaN },
      { quantity: 0 },
      { quantity: 1.5 },
      { quantity: 51 },
      { name: undefined },
      { restaurantId: "" },
    ]) {
      const stored = JSON.stringify({
        nonce,
        lines: [{ ...line(), ...bad }],
      });
      expect(parseStoredCart(stored)).toBeNull();
    }
  });

  it("keeps a cart spanning two restaurants", () => {
    // A basket may hold food from several kitchens now (0092): one rider
    // collects them all and delivers it in one trip.
    const stored = JSON.stringify({
      nonce,
      lines: [line(), line({ menu_item_id: "m2", restaurantId: "r2" })],
    });
    const parsed = parseStoredCart(stored);
    expect(parsed).not.toBeNull();
    expect(parsed?.lines).toHaveLength(2);
  });

  it("rejects a cart with more shops than the server will deliver", () => {
    const lines = Array.from({ length: MAX_SHOPS + 1 }, (_, i) =>
      line({ menu_item_id: `m${i}`, restaurantId: `r${i}` })
    );
    expect(parseStoredCart(JSON.stringify({ nonce, lines }))).toBeNull();
  });
});

describe("storage round trip", () => {
  it("saves, loads and removes per user", async () => {
    const userId = "user-a";
    expect(cartStorageKey(userId)).toBe("kfd.cart.v1.user-a");

    await saveCart(userId, { nonce, lines: [line()] });
    expect(await loadCart(userId)).toEqual({ nonce, lines: [line()] });

    // Another customer on the same phone must not see this cart.
    expect(await loadCart("user-b")).toBeNull();

    await removeCart(userId);
    expect(await loadCart(userId)).toBeNull();
  });

  it("returns null instead of throwing when storage holds garbage", async () => {
    await AsyncStorage.setItem(cartStorageKey("user-c"), "garbage");
    expect(await loadCart("user-c")).toBeNull();
  });
});
