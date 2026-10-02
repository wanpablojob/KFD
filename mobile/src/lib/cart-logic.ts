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
        l.menu_item_id === line.menu_item_id ? { ...l, quantity: l.quantity + 1 } : l
      ),
    };
  }

  return { kind: "added", lines: [...lines, { ...line, quantity: 1 }] };
}

export function setQuantity(
  lines: CartLine[],
  menu_item_id: string,
  quantity: number
): CartLine[] {
  if (quantity <= 0) return lines.filter((l) => l.menu_item_id !== menu_item_id);
  return lines.map((l) => (l.menu_item_id === menu_item_id ? { ...l, quantity } : l));
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
