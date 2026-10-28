/**
 * The refunds ledger: every cent that went back, in one list.
 *
 * Refunds were visible only inside the order they belonged to. That is the
 * right place to record one and the wrong place to audit a month: nobody could
 * answer "how much did we refund, for what, and is one shop or one reason
 * eating the margin" without opening orders one by one.
 *
 * The rows are grouped by a normalised reason because the field is free text
 * typed by whoever recorded the refund -- "Wrong item", "wrong item " and
 * "WRONG ITEM" are the same problem, and a breakdown that treats them as three
 * problems is not a breakdown.
 */

export type RefundMethod = "cash" | "gcash";

export interface RefundEntry {
  id: number;
  orderId: string;
  reference: string;
  customer: string;
  restaurant: string;
  amount: number;
  method: RefundMethod;
  reason: string;
  createdAt: string;
}

export interface RefundReason {
  /** Display form: the first spelling seen for this key. */
  reason: string;
  count: number;
  total: number;
}

export interface RefundSummary {
  count: number;
  total: number;
  cash: number;
  gcash: number;
  average: number;
  /** Largest exposure first; at most the top five. */
  topReasons: RefundReason[];
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Collapse case and whitespace, which is all a free-text reason offers. */
export function reasonKey(reason: string): string {
  return reason.trim().replace(/\s+/g, " ").toLowerCase();
}

export function summarizeRefunds(rows: readonly RefundEntry[]): RefundSummary {
  let total = 0;
  let cash = 0;
  let gcash = 0;
  const reasons = new Map<string, RefundReason>();

  for (const row of rows) {
    const amount = Math.max(0, row.amount);
    total += amount;
    if (row.method === "cash") cash += amount;
    else gcash += amount;

    const key = reasonKey(row.reason);
    // An empty reason still happened; it groups under "No reason given" rather
    // than vanishing from the breakdown.
    const display = key === "" ? "No reason given" : row.reason.trim().replace(/\s+/g, " ");
    const existing = reasons.get(key);
    if (existing) {
      existing.count += 1;
      existing.total += amount;
    } else {
      reasons.set(key, { reason: display, count: 1, total: amount });
    }
  }

  const topReasons = [...reasons.values()]
    .map((row) => ({ ...row, total: cents(row.total) }))
    .sort((a, b) => b.count - a.count || b.total - a.total)
    .slice(0, 5);

  return {
    count: rows.length,
    total: cents(total),
    cash: cents(cash),
    gcash: cents(gcash),
    average: rows.length === 0 ? 0 : cents(total / rows.length),
    topReasons,
  };
}

export interface RefundFilter {
  query?: string;
  method?: "all" | RefundMethod;
}

/** Case-insensitive match over the fields an operator would type. */
export function matchesRefund(row: RefundEntry, filter: RefundFilter): boolean {
  if (filter.method && filter.method !== "all" && row.method !== filter.method) {
    return false;
  }
  const query = (filter.query ?? "").trim().toLowerCase();
  if (!query) return true;
  return [row.reference, row.customer, row.restaurant, row.reason]
    .join(" ")
    .toLowerCase()
    .includes(query);
}
