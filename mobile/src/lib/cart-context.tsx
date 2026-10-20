import {
  createContext,
  use,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type PropsWithChildren,
} from "react";
import {
  addLine,
  checkoutNonce,
  checkoutRequestId,
  countLines,
  groupByRestaurant,
  removeLine,
  setQuantity,
  shopCountOf,
  subtotalOf,
  type AddResult,
  type CartLine,
  type CartShop,
} from "./cart-logic";
import { loadCart, removeCart, saveCart } from "./cart-storage";

export type { CartLine, CartShop } from "./cart-logic";

export interface CartContextValue {
  lines: CartLine[];
  /** The cart split by shop, for the checkout screen. */
  shops: CartShop[];
  /** How many different shops the basket holds. */
  shopCount: number;
  /**
   * Add a line. The result says what happened, so the storefront can tell the
   * customer when the basket is full instead of swallowing the tap.
   */
  add: (line: Omit<CartLine, "quantity">) => AddResult;
  setQuantity: (menu_item_id: string, quantity: number) => void;
  remove: (menu_item_id: string) => void;
  /** Replace the whole cart, e.g. when reordering a past order. */
  replace: (lines: CartLine[]) => void;
  clear: () => void;
  count: number;
  subtotal: number;
  /**
   * The idempotency key for the next checkout, or null while the cart is empty.
   *
   * It lives here rather than in the cart screen because the screen remounts
   * (back to the storefront, then the cart pill again) while the cart survives,
   * and a key that reset with the screen let a retry after a lost response
   * place a second order. It is scoped to the contents too: a repeated key
   * returns the trip already filed for it without re-pricing (0092), so an
   * edited cart must not reuse the old key.
   */
  checkoutRequestId: string | null;
}

export interface CartState {
  lines: CartLine[];
}

export type Action =
  | { type: "add"; line: Omit<CartLine, "quantity"> }
  | { type: "setQuantity"; menu_item_id: string; quantity: number }
  | { type: "remove"; menu_item_id: string }
  | { type: "replace"; lines: CartLine[] }
  | { type: "hydrate"; lines: CartLine[] }
  | { type: "clear" };

export const INITIAL: CartState = { lines: [] };

/** Exported for tests: the cart is the whole point of Phase 2. */
export function reducer(state: CartState, action: Action): CartState {
  switch (action.type) {
    case "add": {
      const result = addLine(state.lines, action.line);
      // A full basket keeps its lines: the shop the customer tried to add is
      // simply refused, and the storefront says so.
      return { lines: result.lines };
    }
    case "setQuantity":
      return {
        ...state,
        lines: setQuantity(state.lines, action.menu_item_id, action.quantity),
      };
    case "remove":
      return { ...state, lines: removeLine(state.lines, action.menu_item_id) };
    case "replace":
      return { lines: action.lines };
    case "hydrate":
      return { lines: action.lines };
    case "clear":
      return INITIAL;
  }
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({
  userId,
  children,
}: PropsWithChildren<{ userId: string }>) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const { lines } = state;
  const [nonce, setNonce] = useState(checkoutNonce);
  const [hydrated, setHydrated] = useState(false);

  // Restore once per customer, before the first save. The `hydrated` gate is
  // what stops the save effect below from writing the empty initial state over
  // the stored cart on the first render of every launch.
  useEffect(() => {
    let active = true;
    void loadCart(userId).then((stored) => {
      if (!active) return;
      if (stored) {
        dispatch({ type: "hydrate", lines: stored.lines });
        setNonce(stored.nonce);
      }
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!hydrated) return;
    if (lines.length === 0) {
      void removeCart(userId);
      return;
    }
    void saveCart(userId, { nonce, lines });
  }, [hydrated, userId, nonce, lines]);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      shops: groupByRestaurant(lines),
      shopCount: shopCountOf(lines),
      add: (line) => {
        // The result is returned so the storefront can say what happened: a
        // full basket is refused, and the tap has to say so out loud.
        const result = addLine(lines, line);
        if (result.kind !== "too_many_shops") {
          dispatch({ type: "add", line });
        }
        return result;
      },
      setQuantity: (menu_item_id, quantity) =>
        dispatch({ type: "setQuantity", menu_item_id, quantity }),
      remove: (menu_item_id) => dispatch({ type: "remove", menu_item_id }),
      replace: (lines) => dispatch({ type: "replace", lines }),
      // No useCallback here: this arrow runs inside the useMemo factory, so
      // calling a hook would be a conditional hook call. dispatch is stable and
      // the value is already memoized on [lines, nonce].
      clear: () => {
        dispatch({ type: "clear" });
        // A new cart is a new checkout: the next trip must not be deduped
        // onto the one just placed.
        setNonce(checkoutNonce());
      },
      count: countLines(lines),
      subtotal: subtotalOf(lines),
      checkoutRequestId: lines.length === 0 ? null : checkoutRequestId(nonce, lines),
    }),
    [lines, nonce]
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
