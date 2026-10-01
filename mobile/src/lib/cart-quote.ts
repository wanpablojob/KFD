import { useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "./cart-context";
import { quoteOrder, type OrderQuote } from "./storefront";

interface QuoteResult {
  key: string;
  quote: OrderQuote | null;
  error: string | null;
}

export interface CartQuote {
  quote: OrderQuote | null;
  loading: boolean;
  error: string | null;
}

/**
 * The server's price for the current cart.
 *
 * The checkout screen used to total the cart itself from constants copied out
 * of customer_place_order. `quote` is null until an answer arrives for the
 * cart as it stands *now*, and returns to null the moment the cart changes, so
 * a total can never lag one edit behind the customer.
 *
 * The fetch never writes a loading flag: it records an answer tagged with the
 * cart it answers, and `loading` is derived from whether that tag still matches.
 * Stale replies are dropped by sequence number, because an RPC cannot be
 * aborted once it is sent.
 */
export function useCartQuote(): CartQuote {
  const { lines, restaurantId } = useCart();
  const [result, setResult] = useState<QuoteResult | null>(null);
  const seq = useRef(0);

  // Keyed on contents, so re-rendering does not re-price but any quantity
  // change does.
  const key = useMemo(
    () =>
      restaurantId
        ? `${restaurantId}|${lines
            .map((l) => `${l.menu_item_id}:${l.quantity}`)
            .join(",")}`
        : "",
    [restaurantId, lines]
  );

  useEffect(() => {
    if (!key || !restaurantId) return;
    const mine = ++seq.current;
    const items = lines.map((l) => ({
      menu_item_id: l.menu_item_id,
      quantity: l.quantity,
    }));

    // Coalesce the burst of quantity taps a customer makes on one item.
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const quote = await quoteOrder({ restaurantId, items });
          if (mine === seq.current) setResult({ key, quote, error: null });
        } catch (cause) {
          if (mine === seq.current) {
            setResult({
              key,
              quote: null,
              error:
                cause instanceof Error ? cause.message : "Could not price this cart.",
            });
          }
        }
      })();
    }, 250);

    return () => clearTimeout(timer);
  }, [key, restaurantId, lines]);

  if (!key) return { quote: null, loading: false, error: null };
  const settled = result?.key === key;
  return {
    quote: settled ? result.quote : null,
    loading: !settled,
    error: settled ? result.error : null,
  };
}
