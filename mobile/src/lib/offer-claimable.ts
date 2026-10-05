/**
 * Is an offer still worth acting on?
 *
 * Two independent reasons an offer in the list cannot be accepted: the window
 * has closed, or the order behind it reached a terminal status. The Available
 * tab already had both checks inline; they live here because the tab badge needs
 * the same answer, and two copies of "claimable" would drift the moment either
 * rule changed -- which would show a rider a badge promising work they cannot
 * take.
 */

/** Order statuses after which the offer is history, not work. */
export const UNCLAIMABLE_ORDER_STATUSES = ["delivered", "cancelled"] as const;

/** The smallest shape the check needs, so it works on an offer or a badge row. */
export interface ClaimableOffer {
  orderStatus: string;
  expiresAt: string;
}

export function secondsUntilExpiry(expiresAt: string, now: number): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000));
}

export function isOfferClaimable(offer: ClaimableOffer, now: number): boolean {
  if ((UNCLAIMABLE_ORDER_STATUSES as readonly string[]).includes(offer.orderStatus)) {
    return false;
  }
  return secondsUntilExpiry(offer.expiresAt, now) > 0;
}

/**
 * What the tab badge counts.
 *
 * Only claimable offers: a badge is a promise that tapping it finds work. An
 * expired offer is visible on the tab but not in the count, so the number stays
 * honest while the list still shows what was already lost.
 *
 * `now` is passed in rather than read from the clock so the caller drives it from
 * the same second-by-second tick the card countdowns use, and so this is
 * testable without a fake timer.
 */
export function countClaimableOffers(
  offers: readonly ClaimableOffer[],
  now: number
): number {
  return offers.reduce(
    (count, offer) => (isOfferClaimable(offer, now) ? count + 1 : count),
    0
  );
}
