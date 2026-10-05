/**
 * Rider list flags.
 *
 * Thresholds live here rather than in the admin_rider_overview() SQL because
 * they are policy, not data, and a policy that exists in two places drifts.
 * The RPC returns the raw numbers (rating, delivered, failed, has_account) and
 * this module turns them into the badges the list renders.
 */

/** Below this, a rider is flagged. The 5-point scale tops out at 5. */
export const LOW_RATING_THRESHOLD = 4;

/** One failure in five completed deliveries. */
export const HIGH_FAILURE_RATE = 0.2;

/**
 * Below this many completed-or-failed deliveries, the rate is not flagged.
 *
 * Without it, every rider's first bad delivery is a 100% failure rate, so the
 * "Needs attention" panel would list every new rider and mean nothing. Three is
 * the smallest sample where a majority reading is possible at all.
 */
export const MIN_DELIVERIES_FOR_RATE = 3;

export type RiderFlag = "low_rating" | "high_failure" | "no_account";

export interface RiderFlagInput {
  rating: number;
  deliveredCount: number;
  failedCount: number;
  hasAccount: boolean;
}

export const FLAG_META: Record<
  RiderFlag,
  { label: string; help: string }
> = {
  low_rating: {
    label: "Low rating",
    help: `Rated below ${LOW_RATING_THRESHOLD.toFixed(1)}. Worth a conversation before the next dispatch.`,
  },
  high_failure: {
    label: "High failures",
    help: `Failed at least ${Math.round(HIGH_FAILURE_RATE * 100)}% of deliveries, across ${MIN_DELIVERIES_FOR_RATE}+ attempts.`,
  },
  no_account: {
    label: "No account",
    help: "No login is linked, so this rider cannot receive offers or sign in to the app.",
  },
};

/**
 * Failed as a share of everything they finished or failed.
 *
 * Denominator is delivered + failed, not deliveries: `riders.deliveries` is a
 * seed-time counter written by 0001 and never recomputed, so using it here
 * would silently compare a live failure count against a frozen success count.
 */
export function failureRate(
  deliveredCount: number,
  failedCount: number,
): number | null {
  const attempts = deliveredCount + failedCount;
  if (attempts <= 0) return null;
  return failedCount / attempts;
}

/**
 * False for an unrated rider.
 *
 * `riders.rating` defaults to 0 (0001), so every rider created since -- through
 * application approval, or by hand in the console -- sits at exactly 0 until
 * somebody rates them. Treating 0 as "rated below 4" would flag the entire
 * fleet of new riders as low-rated and bury the ones that genuinely are.
 */
export function isLowRating(rating: number): boolean {
  return rating > 0 && rating < LOW_RATING_THRESHOLD;
}

export function hasHighFailureRate(
  deliveredCount: number,
  failedCount: number,
): boolean {
  const attempts = deliveredCount + failedCount;
  if (attempts < MIN_DELIVERIES_FOR_RATE) return false;
  const rate = failureRate(deliveredCount, failedCount);
  return rate !== null && rate >= HIGH_FAILURE_RATE;
}

export function riderFlags(input: RiderFlagInput): RiderFlag[] {
  const flags: RiderFlag[] = [];
  if (isLowRating(input.rating)) flags.push("low_rating");
  if (hasHighFailureRate(input.deliveredCount, input.failedCount)) {
    flags.push("high_failure");
  }
  if (!input.hasAccount) flags.push("no_account");
  return flags;
}