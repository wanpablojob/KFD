/**
 * Reading one customer's order history by auth id.
 *
 * The pure half of that read, so it can be tested; the fetch is in
 * supabase/customer-queries.ts. Same split and same reason as lib/rider-orders.ts,
 * which was written for the identical bug on the riders page.
 *
 * Why this exists rather than filtering by name: `orders.customer` holds the
 * customer's NAME as free text (it is what prints on a receipt), so two people
 * called "Maria Santos" would share one order history. `orders.customer_user_id`
 * is a uuid added by 0012 for exactly this, and 0059 put the matching
 * `customers.user_id` on the row.
 *
 * Why a scope function rather than a filter argument: the original fetcher ran
 * with an empty name and could not be corrected, because useAsyncData captures
 * its fetcher once on mount. Returning null for a missing id means the caller has
 * nothing to query and no way to accidentally query everything.
 */

export interface CustomerOrderScope {
  /** Always `customer_user_id`. Not configurable, and not the name. */
  column: "customer_user_id";
  value: string;
}

/** null when there is no resolved id, which means: do not query. */
export function customerOrderScope(
  userId: string | null | undefined,
): CustomerOrderScope | null {
  const trimmed = (userId ?? "").trim();
  if (!trimmed) return null;
  return { column: "customer_user_id", value: trimmed };
}

/**
 * The columns this read needs, and only those.
 *
 * delivery_address and rejection_reason are included because the detail page
 * shows what the customer ordered and where it went; dropping them would
 * silently degrade the table rather than error.
 */
export const CUSTOMER_ORDER_COLUMNS =
  "id, reference, customer, customer_phone, restaurant, items, subtotal, delivery_fee, service_fee, total, status, payment, placed_at, customer_user_id, delivery_address, rejection_reason, delivery_failed_reason, delivery_failed_at" as const;