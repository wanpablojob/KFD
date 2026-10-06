/**
 * Customer tiers, and the one place their thresholds live.
 *
 * The Gold/Silver cut-offs were literals inside the Customers page's render
 * function, which made them three things at once: a business rule, a UI detail,
 * and an unexported constant nothing could assert against. Retuning a tier meant
 * editing JSX, and nothing could tell you what a given customer was worth.
 *
 * Spend arrives from admin_customer_stats() as delivered-only total spend, so the
 * tier is a function of one number that already has a definition. Two rules the
 * page used to get wrong are now enforced here:
 *
 *   * A row with no linked account has no spend at all. `null` is not zero, and
 *     "Standard" would be a claim about someone who has never been identified.
 *     It gets its own label instead of being ranked.
 *   * Thresholds are inclusive of the boundary itself, so the numbers in the
 *     tests are the numbers a customer sitting exactly on the line takes.
 */

export type CustomerTier = "Gold" | "Silver" | "Standard";

/** Delivered-only spend, in pesos. */
export const TIER_THRESHOLDS = {
  /** At or above this, a customer is Gold. */
  gold: 400,
  /** At or above this (and below gold), a customer is Silver. */
  silver: 200,
} as const;

/**
 * Tier for a given delivered spend.
 *
 * `totalSpend` is null for a customer row with no linked auth account, which is
 * the "Not linked" case the page renders separately. This function does not
 * invent a tier for it: it returns null, and the caller decides how to say so.
 */
export function tierForSpend(
  totalSpend: number | null | undefined,
): CustomerTier | null {
  if (totalSpend === null || totalSpend === undefined) return null;
  if (!Number.isFinite(totalSpend)) return null;

  if (totalSpend >= TIER_THRESHOLDS.gold) return "Gold";
  if (totalSpend >= TIER_THRESHOLDS.silver) return "Silver";
  return "Standard";
}

/**
 * The label a row shows, including the unlinked case.
 *
 * "Not linked" is deliberately not a tier: it is the absence of one, and putting
 * it in the same badge vocabulary would suggest an unlinked fixture ranks
 * alongside real customers.
 */
export function tierLabelFor(
  totalSpend: number | null | undefined,
): CustomerTier | "Not linked" {
  return tierForSpend(totalSpend) ?? "Not linked";
}