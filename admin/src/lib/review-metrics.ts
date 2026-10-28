/**
 * Ratings, read as a queue rather than a decoration.
 *
 * `order_ratings` was surfaced as "recent ratings" on one restaurant's page and
 * the merchant home. Both are the right place to *show* a review and the wrong
 * place to *find* one: a one-star review on a shop nobody opened that morning
 * was invisible, and the row that needed a phone call was the one nobody saw.
 *
 * This module answers the questions an operator actually has -- how are the
 * shops doing, how are the riders doing, how much of it is bad, and which
 * shops are carrying the bad part -- without deciding anything about layout.
 */

export interface ReviewEntry {
  orderId: string;
  reference: string;
  customer: string;
  restaurant: string;
  /** 1-5. */
  restaurantRating: number;
  /** 1-5, or null when the customer skipped the rider. */
  riderRating: number | null;
  comment: string | null;
  createdAt: string;
}

export interface ReviewSummary {
  count: number;
  /** Mean shop rating, one decimal. Zero when there are no rows. */
  averageRestaurant: number;
  /** Mean rider rating over the reviews that scored a rider. */
  averageRider: number;
  /** Ratings of 1 or 2: the ones worth a call. */
  low: number;
  /** Share of all reviews that are low, 0-1. */
  lowShare: number;
  /** Reviews that said something, not only tapped stars. */
  withComment: number;
}

/** Review text is the only thing a search can match besides names. */
export interface ReviewFilter {
  query?: string;
  /** "low" is 1-2 stars; a number matches that exact score. */
  stars?: "all" | "low" | 3 | 4 | 5;
  restaurant?: string;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 10) / 10;
}

export function summarizeReviews(rows: readonly ReviewEntry[]): ReviewSummary {
  const restaurantScores = rows.map((row) => row.restaurantRating);
  const riderScores = rows
    .map((row) => row.riderRating)
    .filter((score): score is number => score !== null);
  const low = rows.filter((row) => row.restaurantRating <= 2).length;

  return {
    count: rows.length,
    averageRestaurant: mean(restaurantScores),
    averageRider: mean(riderScores),
    low,
    lowShare: rows.length === 0 ? 0 : Math.round((low / rows.length) * 100) / 100,
    withComment: rows.filter((row) => (row.comment ?? "").trim() !== "").length,
  };
}

/** 5 down to 1, with the share of the total each score holds. */
export function ratingDistribution(
  rows: readonly ReviewEntry[],
): { stars: number; count: number; share: number }[] {
  return [5, 4, 3, 2, 1].map((stars) => {
    const count = rows.filter((row) => row.restaurantRating === stars).length;
    return {
      stars,
      count,
      share: rows.length === 0 ? 0 : Math.round((count / rows.length) * 100) / 100,
    };
  });
}

export function matchesReview(row: ReviewEntry, filter: ReviewFilter): boolean {
  if (filter.restaurant && filter.restaurant !== "all") {
    if (row.restaurant !== filter.restaurant) return false;
  }

  if (filter.stars && filter.stars !== "all") {
    if (filter.stars === "low") {
      if (row.restaurantRating > 2) return false;
    } else if (row.restaurantRating !== filter.stars) {
      return false;
    }
  }

  const query = (filter.query ?? "").trim().toLowerCase();
  if (!query) return true;
  return [row.reference, row.customer, row.restaurant, row.comment ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(query);
}
