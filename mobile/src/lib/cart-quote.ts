import { useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "./cart-context";
import { toShopPayload } from "./cart-logic";
import { quoteDelivery, type DeliveryQuote } from "./storefront";

interface QuoteResult {
  key: string;
  quote: DeliveryQuote | null;
  error: string | null;
}

export interface CartQuote {
  quote: DeliveryQuote | null;
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
 * The basket may hold food from several shops (0092): the whole thing is
 * priced as one trip, with the delivery fee carrying 10.00 for every shop
 * after the first and the service fee charged once.
 *
 * The fetch never writes a loading flag: it records an answer tagged with the
 * cart it answers, and `loading` is derived from whether that tag still matches.
 * Stale replies are dropped by sequence number, because an RPC cannot be
 * aborted once it is sent.
 */
export function useCartQuote(barangay?: string | null): CartQuote {
  const { lines } = useCart();
  const [result, setResult] = useState<QuoteResult | null>(null);
  const seq = useRef(0);

  // Keyed on contents and destination, so re-rendering does not re-price but
  // any quantity or barangay change does.
  const key = useMemo(
    () =>
      lines.length > 0
        ? `${barangay ?? ""}|${lines
            .map((l) => `${l.menu_item_id}:${l.quantity}`)
            .join(",")}`
        : "",
    [barangay, lines]
  );

  useEffect(() => {
    if (!key) return;
    const mine = ++seq.current;
    const shops = toShopPayload(lines);

    // Coalesce the burst of quantity taps a customer makes on one item.
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const quote = await quoteDelivery({ shops, barangay });
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
  }, [key, barangay, lines]);

  if (!key) return { quote: null, loading: false, error: null };
  const settled = result?.key === key;
  return {
    quote: settled ? result.quote : null,
    loading: !settled,
    error: settled ? result.error : null,
  };
}
