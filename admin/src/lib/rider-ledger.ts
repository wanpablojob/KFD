/**
 * The rider earnings ledger, as the admin pages read it.
 *
 * rider_payouts is the record of what a rider actually earned: one row per
 * completed delivery, amount frozen at claim time (migration 0038). It is the
 * only source for that number.
 *
 * Two things this deliberately does not use:
 *
 *   - `orders.total`, which is what the *customer* paid. Summing it produced a
 *     figure labelled earnings that had nothing to do with earnings.
 *   - `riders.earnings` as the page's source. Migration 0038 does maintain it
 *     and reconciles it to the ledger, but it is a denormalised counter: it
 *     cannot answer "this week", it is not per-delivery, and reading two sources
 *     for one concept is how the two drift apart in the first place.
 */

export interface RiderPayoutSummary {
  /** Every peso ever recorded. */
  lifetime: number;
  earnedToday: number;
  earnedWeek: number;
  /**
   * Completed deliveries, counted on orders. The same count the riders list
   * shows, so the two pages cannot report different totals for one rider.
   */
  deliveredCount: number;
  /** Deliveries this rider reported as failed (0044). */
  failedCount: number;
  /**
   * Ledger rows. Lower than deliveredCount for any delivery that predates the
   * ledger, which recorded no payout. The money figures come from these.
   */
  payoutCount: number;
  firstEarnedAt: string | null;
  lastEarnedAt: string | null;
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Maps the RPC's single row.
 *
 * Every aggregate is defaulted to zero rather than left nullable: the page
 * formats all of them unconditionally, and `null.toFixed(2)` is a blank panel.
 */
export function mapPayoutSummary(
  row: Record<string, unknown> | null | undefined,
): RiderPayoutSummary {
  return {
    lifetime: num(row?.lifetime),
    earnedToday: num(row?.earned_today),
    earnedWeek: num(row?.earned_week),
    deliveredCount: num(row?.delivered_count),
    failedCount: num(row?.failed_count),
    payoutCount: num(row?.payout_count),
    firstEarnedAt: text(row?.first_earned_at),
    lastEarnedAt: text(row?.last_earned_at),
  };
}

/** One row of the per-delivery payout table. */
export interface RiderPayout {
  orderId: string;
  reference: string;
  restaurant: string;
  amount: number;
  earnedAt: string;
}

export function mapPayouts(
  rows: readonly Record<string, unknown>[] | null | undefined,
): RiderPayout[] {
  return (rows ?? []).map((row) => ({
    orderId: String(row.order_id ?? ""),
    reference: String(row.order_reference ?? ""),
    restaurant: String(row.restaurant ?? ""),
    amount: num(row.amount),
    earnedAt: String(row.earned_at ?? ""),
  }));
}

/**
 * Completed deliveries as a share of everything attempted, or null when nothing
 * has been attempted.
 *
 * A failed delivery never reaches the ledger -- it earns nothing -- so the
 * denominator has to add them back. Without that, every rider reads 100%.
 *
 * Null rather than 0 for "no attempts": a rider with no deliveries has no
 * success rate, and 0% would read as "every delivery failed".
 */
export function successRate(counts: {
  deliveredCount: number;
  failedCount: number;
}): number | null {
  const attempted = counts.deliveredCount + counts.failedCount;
  if (attempted <= 0) return null;
  return counts.deliveredCount / attempted;
}

/** "9 of 12 deliveries completed", the wording next to the rate. */
export function successRateLabel(counts: {
  deliveredCount: number;
  failedCount: number;
}): string {
  const rate = successRate(counts);
  if (rate === null) return "No completed deliveries yet";
  return `${Math.round(rate * 100)}% — ${counts.deliveredCount} of ${
    counts.deliveredCount + counts.failedCount
  } deliveries completed`;
}