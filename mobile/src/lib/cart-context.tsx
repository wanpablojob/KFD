import { createContext, use, useMemo, useReducer, type PropsWithChildren } from "react";
import {
  addLine,
  countLines,
  removeLine,
  restaurantNameOf,
  restaurantOf,
  setQuantity,
  subtotalOf,
  type CartLine,
} from "./cart-logic";

export type { CartLine } from "./cart-logic";

/**
 * A line the customer tried to add while the cart held a different restaurant.
 *
 * `add` used to return the previous cart unchanged in this case, so the ADD tap
 * looked broken and only checkout ever explained it, by which point the customer
 * had no idea which line was the problem. The line is held here instead, and the
 * restaurant screen resolves it where the intent is, with the customer watching.
 */
export interface PendingRestaurantLine {
  line: CartLine;
  previousRestaurantName: string;
  previousItemCount: number;
}

export interface CartContextValue {
  lines: CartLine[];
  pending: PendingRestaurantLine | null;
  add: (line: Omit<CartLine, "quantity">) => void;
  /** Replace the cart with the held line. */
  acceptPending: () => void;
  /** Keep the cart. The held line is dropped. */
  dismissPending: () => void;
  setQuantity: (menu_item_id: string, quantity: number) => void;
  remove: (menu_item_id: string) => void;
  clear: () => void;
  count: number;
  subtotal: number;
  restaurantId: string | null;
  restaurantName: string | null;
}

export interface CartState {
  lines: CartLine[];
  pending: PendingRestaurantLine | null;
}

export type Action =
  | { type: "add"; line: Omit<CartLine, "quantity"> }
  | { type: "setQuantity"; menu_item_id: string; quantity: number }
  | { type: "remove"; menu_item_id: string }
  | { type: "clear" }
  | { type: "acceptPending" }
  | { type: "dismissPending" };

export const INITIAL: CartState = { lines: [], pending: null };

/** Exported for tests: the swap flow is the whole point of Phase 2. */
export function reducer(state: CartState, action: Action): CartState {
  switch (action.type) {
    case "add": {
      const result = addLine(state.lines, action.line);
      if (result.kind === "other_restaurant") {
        return {
          lines: result.lines,
          pending: {
            line: result.pending,
            previousRestaurantName: result.previousRestaurantName,
            previousItemCount: result.previousItemCount,
          },
        };
      }
      // A resolved line clears any stale hold, so a customer who backs out of
      // one prompt and then adds normally is not left holding a line that no
      // longer matches the screen.
      return { lines: result.lines, pending: null };
    }
    case "setQuantity":
      return {
        ...state,
        lines: setQuantity(state.lines, action.menu_item_id, action.quantity),
      };
    case "remove":
      return { ...state, lines: removeLine(state.lines, action.menu_item_id) };
    case "clear":
      return INITIAL;
    case "acceptPending":
      if (!state.pending) return state;
      return { lines: [state.pending.line], pending: null };
    case "dismissPending":
      return { ...state, pending: null };
  }
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const { lines, pending } = state;

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      pending,
      add: (line) => dispatch({ type: "add", line }),
      acceptPending: () => dispatch({ type: "acceptPending" }),
      dismissPending: () => dispatch({ type: "dismissPending" }),
      setQuantity: (menu_item_id, quantity) =>
        dispatch({ type: "setQuantity", menu_item_id, quantity }),
      remove: (menu_item_id) => dispatch({ type: "remove", menu_item_id }),
      // No useCallback here: this arrow runs inside the useMemo factory, so
      // calling a hook would be a conditional hook call. dispatch is stable and
      // the value is already memoized on [lines, pending].
      clear: () => dispatch({ type: "clear" }),
      count: countLines(lines),
      subtotal: subtotalOf(lines),
      restaurantId: restaurantOf(lines),
      restaurantName: restaurantNameOf(lines),
    }),
    [lines, pending]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const value = use(CartContext);
  if (!value) {
    throw new Error("useCart must be used inside a <CartProvider />");
  }
  return value;
}
