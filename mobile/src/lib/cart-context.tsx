import { createContext, use, useState, type PropsWithChildren } from "react";

export interface CartLine {
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
  restaurantId: string;
}

export interface CartContextValue {
  lines: CartLine[];
  add: (line: Omit<CartLine, "quantity">) => void;
  setQuantity: (menu_item_id: string, quantity: number) => void;
  remove: (menu_item_id: string) => void;
  clear: () => void;
  count: number;
  subtotal: number;
  restaurantId: string | null;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: PropsWithChildren) {
  const [lines, setLines] = useState<CartLine[]>([]);

  const value: CartContextValue = {
    lines,
    add: (line) =>
      setLines((prev) => {
        const otherRestaurant = prev.find((l) => l.restaurantId !== line.restaurantId);
        if (otherRestaurant) return prev;
        const existing = prev.find((l) => l.menu_item_id === line.menu_item_id);
        if (existing) {
          return prev.map((l) =>
            l.menu_item_id === line.menu_item_id
              ? { ...l, quantity: l.quantity + 1 }
              : l
          );
        }
        return [...prev, { ...line, quantity: 1 }];
      }),
    setQuantity: (menu_item_id, quantity) =>
      setLines((prev) =>
        quantity <= 0
          ? prev.filter((l) => l.menu_item_id !== menu_item_id)
          : prev.map((l) => (l.menu_item_id === menu_item_id ? { ...l, quantity } : l))
      ),
    remove: (menu_item_id) =>
      setLines((prev) => prev.filter((l) => l.menu_item_id !== menu_item_id)),
    clear: () => setLines([]),
    count: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal: lines.reduce((n, l) => n + l.price * l.quantity, 0),
    restaurantId: lines.length === 0 ? null : lines[0].restaurantId,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const value = use(CartContext);
  if (!value) {
    throw new Error("useCart must be used inside a <CartProvider />");
  }
  return value;
}
