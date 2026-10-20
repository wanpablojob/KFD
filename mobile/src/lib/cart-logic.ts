/**
 * Cart line maths and the multi-shop rule, kept as pure functions so they
 * can be tested without React or Supabase.
 *
 * A cart may hold food from several restaurants. The customer checks out once
 * and one rider collects from every shop in the basket and delivers it in one
 * trip, so nothing here needs to know which shop a line came from beyond
 * grouping the lines for the screen and pricing them together.
 *
 * The rule that used to live here -- one restaurant per cart, with a "start a
 * new cart?" prompt -- is gone: a basket with food from ten kitchens is one
 * basket now. What is left is the cap the server enforces (0092): ten shops in
 * one delivery.
 */

export interface CartLine {
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
  restaurantId: string;
  /** Carried so the checkout can name the shop a line came from. */
  restaurantName: string;
}

/** One shop's part of the cart. */
export interface CartShop {
  restaurantId: string;
  restaurantName: string;
  lines: CartLine[];
  /** How many items in total, across the shop's lines. */
  count: number;
  /** The shop's own food, so the screen can show a subtotal per shop. */
  subtotal: number;
}

export type AddResult =
  | { kind: "added"; lines: CartLine[] }
  | { kind: "merged"; lines: CartLine[] }
  /** Refused: the basket already holds the maximum number of shops. */
  | { kind: "too_many_shops"; lines: CartLine[]; shopCount: number };

/** Mirrors customer_place_delivery's cap (0092): ten shops in one delivery. */
export const MAX_SHOPS = 10;

/** Mirrors customer_place_order's per-line cap (0076), so the stepper stops where the server would. */
export const MAX_QUANTITY = 50;

export function addLine(
  lines: CartLine[],
  line: Omit<CartLine, "quantity">
): AddResult {
  const existing = lines.find((l) => l.menu_item_id === line.menu_item_id);
  if (existing) {
    return {
      kind: "merged",
      lines: lines.map((l) =>
        l.menu_item_id === line.menu_item_id
          ? { ...l, quantity: Math.min(l.quantity + 1, MAX_QUANTITY) }
          : l
      ),
    };
  }

  // A new shop in the basket. The server refuses an eleventh, so the app
  // refuses it here too, with a message the customer can read.
  if (
    !lines.some((l) => l.restaurantId === line.restaurantId) &&
    shopCountOf(lines) >= MAX_SHOPS
  ) {
    return { kind: "too_many_shops", lines, shopCount: shopCountOf(lines) };
  }

  return { kind: "added", lines: [...lines, { ...line, quantity: 1 }] };
}

export function setQuantity(
  lines: CartLine[],
  menu_item_id: string,
  quantity: number
): CartLine[] {
  if (quantity <= 0) return lines.filter((l) => l.menu_item_id !== menu_item_id);
  const capped = Math.min(quantity, MAX_QUANTITY);
  return lines.map((l) =>
    l.menu_item_id === menu_item_id ? { ...l, quantity: capped } : l
  );
}

export function removeLine(lines: CartLine[], menu_item_id: string): CartLine[] {
  return lines.filter((l) => l.menu_item_id !== menu_item_id);
}

export function countLines(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0);
}

export function subtotalOf(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.price * l.quantity, 0);
}

/**
 * The cart split by shop, in the order the shops were added.
 *
 * The checkout shows one card per shop with its own subtotal, because that is
 * what the customer bought from that kitchen, and the whole trip is priced
 * together on top of it.
 */
export function groupByRestaurant(lines: CartLine[]): CartShop[] {
  const shops: CartShop[] = [];
  for (const line of lines) {
    const shop = shops.find((s) => s.restaurantId === line.restaurantId);
    if (shop) {
      shop.lines.push(line);
      shop.count += line.quantity;
      shop.subtotal += line.price * line.quantity;
      continue;
    }
    shops.push({
      restaurantId: line.restaurantId,
      restaurantName: line.restaurantName,
      lines: [line],
      count: line.quantity,
      subtotal: line.price * line.quantity,
    });
  }
  return shops;
}

/** How many different shops the basket holds. */
export function shopCountOf(lines: CartLine[]): number {
  return new Set(lines.map((l) => l.restaurantId)).size;
}

/** Is the basket at the server's cap of shops? */
export function isFullCart(lines: CartLine[]): boolean {
  return shopCountOf(lines) >= MAX_SHOPS;
}

/**
 * The basket as the server wants it: one entry per shop, each with its lines.
 *
 * The order of the shops is the order they were added, so the trip is picked
 * up in the order the customer saw.
 */
export function toShopPayload(
  lines: CartLine[]
): { restaurant_id: string; items: { menu_item_id: string; quantity: number }[] }[] {
  return groupByRestaurant(lines).map((shop) => ({
    restaurant_id: shop.restaurantId,
    items: shop.lines.map((line) => ({
      menu_item_id: line.menu_item_id,
      quantity: line.quantity,
    })),
  }));
}

/**
 * A stable, short digest of what the cart is asking to buy.
 *
 * It scopes the checkout idempotency key. The key has to survive a screen
 * remount (a retry after a lost response must not place a second order), but it
 * must not survive an edit: `customer_place_delivery` returns the trip already
 * filed under a repeated key *without* re-pricing it (0092), so reusing the key
 * after the customer changes a quantity would send them to the wrong trip.
 * Sorting makes the digest depend on contents, not tap order.
 */
export function cartFingerprint(lines: CartLine[]): string {
  const canonical = [...lines]
    .sort((a, b) => a.menu_item_id.localeCompare(b.menu_item_id))
    .map((l) => `${l.menu_item_id}:${l.quantity}:${l.price}`)
    .join("|");
  // FNV-1a, 32-bit. Not a security hash: it only has to separate two carts a
  // customer could plausibly retry in a row.
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${canonical.length.toString(36)}${(hash >>> 0).toString(36)}`;
}

/** The random half of a checkout key; regenerated when a cart is cleared. */
export function checkoutNonce(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The idempotency key sent with a checkout: the cart's nonce plus a digest of
 * its contents. `customer_place_delivery` accepts 8-64 characters (0076),
 * which this stays inside for any cart the app can build.
 */
export function checkoutRequestId(nonce: string, lines: CartLine[]): string {
  return `${nonce}-${cartFingerprint(lines)}`;
}

/**
 * The delivery fee, split so the customer can see what they are paying for.
 *
 * The server sends the fee for the destination barangay (`base_delivery_fee`)
 * and the fee for the whole trip (`delivery_fee`), which also carries 10.00
 * for every shop after the first (0092). The surcharge is the difference, so
 * the app never hardcodes the price: it shows what the server charged.
 */
export interface FeeBreakdown {
  /** The barangay's own delivery rate. */
  base: number;
  /** How many shops are in the basket after the first. */
  extraShops: number;
  /** What each extra shop costs. */
  extraShopFee: number;
  /** The whole delivery fee: base plus the extra shops. */
  deliveryFee: number;
  serviceFee: number;
  total: number;
  /** True when the fee is settled with the rider at the door. */
  feeAgreedInPerson: boolean;
}

export function feeBreakdown(quote: {
  shop_count: number;
  base_delivery_fee: number;
  delivery_fee: number;
  service_fee: number;
  total: number;
  fee_agreed_in_person?: boolean;
}): FeeBreakdown {
  const extraShops = Math.max(quote.shop_count - 1, 0);
  const surcharge = quote.delivery_fee - quote.base_delivery_fee;
  return {
    base: quote.base_delivery_fee,
    extraShops,
    extraShopFee: extraShops > 0 ? surcharge / extraShops : 0,
    deliveryFee: quote.delivery_fee,
    serviceFee: quote.service_fee,
    total: quote.total,
    feeAgreedInPerson: quote.fee_agreed_in_person === true,
  };
}
