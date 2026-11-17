import type { RiderCashPosition } from "@/lib/types";

/** Under half a centavo, "on hand" is rounding noise, not cash. */
const ON_HAND_EPSILON = 0.005;

/**
 * Riders still holding customer cash, biggest amount first.
 *
 * The summary card and the modal both read this list, so the count on the card
 * and the rows in the modal can never disagree about who owes cash.
 */
export function ridersHoldingCash(
  rows: RiderCashPosition[],
): RiderCashPosition[] {
  return rows
    .filter((row) => row.onHand > ON_HAND_EPSILON)
    .sort(
      (a, b) => b.onHand - a.onHand || a.riderName.localeCompare(b.riderName),
    );
}

/** Total customer cash the listed riders are holding. */
export function cashOnHandTotal(rows: RiderCashPosition[]): number {
  return rows.reduce((sum, row) => sum + row.onHand, 0);
}
