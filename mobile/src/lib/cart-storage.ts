import AsyncStorage from "@react-native-async-storage/async-storage";
import { MAX_QUANTITY, type CartLine } from "./cart-logic";

/**
 * The cart on disk, so the OS killing a backgrounded app does not lose it.
 *
 * The addresses, the catalogue and the order list already survive a kill; the
 * cart was the one piece of customer state kept only in memory, and it is the
 * one that costs the most to rebuild. Storage is AsyncStorage for the same
 * reason as `addresses.ts`: a cart is not a credential, so it does not belong
 * in SecureStore.
 *
 * The nonce travels with the lines. It is half of the checkout idempotency key,
 * and keeping it means a customer who taps ORDER NOW, loses the response, and
 * has the app killed before the retry still retries against the same key -- the
 * server returns the order that landed instead of creating a second one.
 *
 * Anything that does not parse cleanly is discarded rather than repaired: a
 * cart is easy to rebuild, and a half-understood one would be a wrong price on
 * the checkout screen.
 */
const KEY_PREFIX = "kfd.cart.v1.";

export interface StoredCart {
  nonce: string;
  lines: CartLine[];
}

export function cartStorageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

function isLine(value: unknown): value is CartLine {
  if (value === null || typeof value !== "object") return false;
  const line = value as Record<string, unknown>;
  return (
    typeof line.menu_item_id === "string" &&
    line.menu_item_id.length > 0 &&
    typeof line.name === "string" &&
    typeof line.price === "number" &&
    Number.isFinite(line.price) &&
    line.price >= 0 &&
    typeof line.quantity === "number" &&
    Number.isInteger(line.quantity) &&
    line.quantity >= 1 &&
    line.quantity <= MAX_QUANTITY &&
    typeof line.restaurantId === "string" &&
    line.restaurantId.length > 0 &&
    typeof line.restaurantName === "string"
  );
}

/** Exported for tests: validates a payload before the checkout screen trusts it. */
export function parseStoredCart(raw: string | null): StoredCart | null {
  if (!raw) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (value === null || typeof value !== "object") return null;

  const cart = value as Record<string, unknown>;
  if (typeof cart.nonce !== "string" || cart.nonce.length < 8) return null;
  if (!Array.isArray(cart.lines) || cart.lines.length === 0) return null;
  if (!cart.lines.every(isLine)) return null;

  // One restaurant per cart, the rule addLine enforces and the server assumes.
  const restaurantId = (cart.lines[0] as CartLine).restaurantId;
  if (cart.lines.some((line) => (line as CartLine).restaurantId !== restaurantId)) {
    return null;
  }

  return { nonce: cart.nonce, lines: cart.lines as CartLine[] };
}

export async function loadCart(userId: string): Promise<StoredCart | null> {
  try {
    return parseStoredCart(await AsyncStorage.getItem(cartStorageKey(userId)));
  } catch {
    // Storage unavailable: the cart still works for this session.
    return null;
  }
}

export async function saveCart(userId: string, cart: StoredCart): Promise<void> {
  try {
    await AsyncStorage.setItem(cartStorageKey(userId), JSON.stringify(cart));
  } catch {
    // Same: losing persistence is not losing the cart the customer is holding.
  }
}

export async function removeCart(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(cartStorageKey(userId));
  } catch {
    // Nothing to do; the next save overwrites it.
  }
}
