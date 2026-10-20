/**
 * Cart line maths and the multi-restaurant rule, kept as pure functions so they
 * can be tested without React or Supabase.
 *
 * The bug this replaces: `add` returned the previous cart unchanged when the
 * incoming line came from a different restaurant, so tapping ADD on a second
 * restaurant looked like nothing happened. Only checkout ever complained, and
 * by then the customer had no idea which line was the problem.
 */

export interface CartLine {
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
  restaurantId: string;
  /** Carried so "start a new cart?" can name what would be cleared. */
  restaurantName: string;
}

export type AddResult =
  | { kind: "added"; lines: CartLine[] }
  | { kind: "merged"; lines: CartLine[] }
  /** Blocked: the cart holds a different restaurant. Caller must resolve. */
  | {
      kind: "other_restaurant";
      lines: CartLine[];
      pending: CartLine;
      /**
       * What the customer stands to lose. A destructive confirm that cannot
       * say what it destroys is a coin flip.
       */
      previousRestaurantName: string;
      previousItemCount: number;
    };

export function addLine(
  lines: CartLine[],
  line: Omit<CartLine, "quantity">
): AddResult {
  const other = lines.find((l) => l.restaurantId !== line.restaurantId);
  if (other) {
    return {
      kind: "other_restaurant",
      lines,
      pending: { ...line, quantity: 1 },
      previousRestaurantName: other.restaurantName,
      previousItemCount: countLines(lines),
    };
  }

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

  return { kind: "added", lines: [...lines, { ...line, quantity: 1 }] };
}

/** Mirrors customer_place_order's per-line cap (0076), so the stepper stops where the server would. */
export const MAX_QUANTITY = 50;

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

export function restaurantOf(lines: CartLine[]): string | null {
  return lines.length === 0 ? null : lines[0].restaurantId;
}

/** The restaurant the cart belongs to, for the checkout header. */
export function restaurantNameOf(lines: CartLine[]): string | null {
  return lines.length === 0 ? null : lines[0].restaurantName;
}

/**
 * A stable, short digest of what the cart is asking to buy.
 *
 * It scopes the checkout idempotency key. The key has to survive a screen
 * remount (a retry after a lost response must not place a second order), but it
 * must not survive an edit: `customer_place_order` returns the order already
 * filed under a repeated key *without* re-pricing it (0081), so reusing the key
 * after the customer changes a quantity would send them to the wrong order.
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
 * its contents. `customer_place_order` accepts 8-64 characters (0076), which
 * this stays inside for any cart the app can build.
 */
export function checkoutRequestId(nonce: string, lines: CartLine[]): string {
  return `${nonce}-${cartFingerprint(lines)}`;
}
