/**
 * Grouping the payout history into day sections.
 *
 * A flat list of thirty "Mar 4, 2:15 PM" lines is technically the truth and
 * practically unreadable: the question a rider asks is "what did I make
 * yesterday", and that wants a heading. The timestamps stay on each row, because
 * within a day the time is what distinguishes two deliveries.
 */

export interface PayoutRow {
  order_id: string;
  earned_at: string;
}

export type DayBucket = "today" | "yesterday" | "earlier";

export interface PayoutGroup<T> {
  /** Which section this is, used for the heading text. */
  bucket: DayBucket;
  /** Rows in their original order -- newest first, as the RPC returns them. */
  rows: T[];
}

/**
 * Local calendar day, not a 24-hour window.
 *
 * "Today" for a rider at 11pm has to mean their today. Comparing timestamps
 * would put an 11pm payout on tomorrow's heading and, after midnight, the
 * previous night's earnings would silently slide into "yesterday".
 */
export function dayBucket(iso: string, now: Date): DayBucket {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "earlier";

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfRow = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const days = Math.round((startOfToday.getTime() - startOfRow.getTime()) / 86_400_000);

  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return "earlier";
}

export const BUCKET_LABEL: Record<DayBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier",
};

/** In render order. "Earlier" is a single section, not one per date. */
export const BUCKET_ORDER: DayBucket[] = ["today", "yesterday", "earlier"];

export function groupPayoutsByDay<T extends PayoutRow>(
  rows: readonly T[],
  now: Date
): PayoutGroup<T>[] {
  const byBucket = new Map<DayBucket, T[]>();
  for (const row of rows) {
    const bucket = dayBucket(row.earned_at, now);
    const existing = byBucket.get(bucket);
    if (existing) existing.push(row);
    else byBucket.set(bucket, [row]);
  }

  // Sections appear in BUCKET_ORDER and empty ones are dropped, so the screen
  // never renders a "Today" heading with nothing under it.
  return BUCKET_ORDER.filter((bucket) => byBucket.has(bucket)).map((bucket) => ({
    bucket,
    rows: byBucket.get(bucket) ?? [],
  }));
}

/** Total for a section heading, e.g. "Today · ₱240.00". */
export function bucketTotal<T extends PayoutRow & { amount: number }>(
  group: PayoutGroup<T>
): number {
  return group.rows.reduce((sum, row) => sum + Number(row.amount), 0);
}

/**
 * Does this payout need the rider to know about it? (migration 0075)
 *
 * Only 'disputed' does. The other three states are the rider's business only
 * in the sense that the money is theirs and nothing is happening to it, so
 * showing a badge for them would be noise on a screen a rider reads dozens of
 * times a day. A disputed one is different: their delivery is being questioned,
 * and they should not have to notice the total moved later.
 *
 * An absent or unrecognised state returns false. That is the pre-0075 case --
 * nothing to report -- and it is also the safe default, since a false negative
 * costs one missed badge while a false positive would cry wolf on every row.
 */
export function needsRiderAttention(settlementState?: string): boolean {
  return settlementState === "disputed";
}
