/**
 * The customer profile summary: order status mix, payment mix, and where this
 * person gets delivered.
 *
 * The SQL aggregates all of it in admin_customer_summary() and returns one jsonb
 * row. This module is the defensive half: it is a single jsonb blob whose keys
 * and value types the compiler cannot check, so the shape is asserted here
 * rather than discovered at runtime as `undefined.map is not a function`.
 *
 * Why aggregate server-side at all: the order history is paginated, so the
 * browser holds one page. A status or payment mix computed from that page is
 * wrong for exactly the customers with the most orders, and wrong quietly.
 */

export type CustomerAddress = {
  address: string;
  /** How many of their orders went here. */
  times: number;
  /** ISO timestamp of their most recent order to this address. */
  lastUsed: string;
};

export type CustomerSummary = {
  /** order_status -> count. Only statuses that occurred are present. */
  statusCounts: Record<string, number>;
  /** payment_method -> count. */
  paymentCounts: Record<string, number>;
  /** Most recently used first. */
  recentAddresses: CustomerAddress[];
  /** True when this customer has never ordered. */
  empty: boolean;
};

function countMap(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) out[key] = n;
  }
  return out;
}

export function mapCustomerSummary(raw: unknown): CustomerSummary {
  const root = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;

  const statusCounts = countMap(root.statusCounts);
  const paymentCounts = countMap(root.paymentCounts);

  const addresses: CustomerAddress[] = Array.isArray(root.recentAddresses)
    ? root.recentAddresses.flatMap((entry) => {
        if (typeof entry !== "object" || entry === null) return [];
        const row = entry as Record<string, unknown>;
        const address = typeof row.address === "string" ? row.address.trim() : "";
        // An address with no text is not an address; the SQL filters those, and
        // this repeats the filter so a hand-edited payload cannot render a blank
        // row in the list.
        if (!address) return [];
        const times = Number(row.times);
        return [
          {
            address,
            times: Number.isFinite(times) && times > 0 ? times : 0,
            lastUsed:
              typeof row.lastUsed === "string" && row.lastUsed.trim()
                ? row.lastUsed
                : "",
          },
        ];
      })
    : [];

  return {
    statusCounts,
    paymentCounts,
    recentAddresses: addresses,
    empty:
      Object.keys(statusCounts).length === 0 && addresses.length === 0,
  };
}

/**
 * Payment mix as "label -> share of orders", for a bar or a legend.
 *
 * Shares are computed here rather than in SQL because "60% cash" is a
 * presentation concern; the counts stay the raw numbers and the SQL stays the
 * only place they are produced.
 */
export function paymentMixShares(
  paymentCounts: Record<string, number>,
): { key: string; label: string; count: number; share: number }[] {
  const total = Object.values(paymentCounts).reduce((sum, n) => sum + n, 0);
  return Object.entries(paymentCounts)
    .map(([key, count]) => ({
      key,
      label: key.replace(/_/g, " "),
      count,
      share: total === 0 ? 0 : count / total,
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}