import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchesReview,
  ratingDistribution,
  scoreboard,
  summarizeReviews,
  type ReviewEntry,
} from "./review-metrics.ts";

/**
 * The reviews queue's arithmetic.
 *
 * The point of the page is to make the bad reviews findable. A summary that
 * averages a skipped rider score as a zero, or a filter that lets a one-star
 * review through the "low" bucket, would hide exactly the rows it exists for.
 */

function review(overrides: Partial<ReviewEntry> = {}): ReviewEntry {
  return {
    orderId: "ord_1",
    reference: "#KFD-1",
    customer: "Ana",
    restaurant: "Habhab",
    rider: "Juan",
    restaurantRating: 5,
    riderRating: 4,
    comment: null,
    createdAt: new Date(2026, 9, 2, 12).toISOString(),
    ...overrides,
  };
}

test("averages shops and riders, ignoring a rider the customer skipped", () => {
  const summary = summarizeReviews([
    review({ orderId: "a", restaurantRating: 5, riderRating: 5 }),
    review({ orderId: "b", restaurantRating: 4, riderRating: null }),
    review({ orderId: "c", restaurantRating: 3, riderRating: 3 }),
  ]);

  assert.equal(summary.count, 3);
  assert.equal(summary.averageRestaurant, 4);
  assert.equal(summary.averageRider, 4);
});

test("counts the low ratings and the reviews that said something", () => {
  const summary = summarizeReviews([
    review({ orderId: "a", restaurantRating: 1, comment: "Cold" }),
    review({ orderId: "b", restaurantRating: 2, comment: "   " }),
    review({ orderId: "c", restaurantRating: 5, comment: null }),
    review({ orderId: "d", restaurantRating: 4, comment: "Good" }),
  ]);

  assert.equal(summary.low, 2);
  assert.equal(summary.lowShare, 0.5);
  assert.equal(summary.withComment, 2);
});

test("an empty set reports zeroes, not NaN", () => {
  const summary = summarizeReviews([]);
  assert.deepEqual(summary, {
    count: 0,
    averageRestaurant: 0,
    averageRider: 0,
    low: 0,
    lowShare: 0,
    withComment: 0,
  });
});

test("distribution covers every score, 5 down to 1, with shares", () => {
  const rows = [
    review({ orderId: "a", restaurantRating: 5 }),
    review({ orderId: "b", restaurantRating: 5 }),
    review({ orderId: "c", restaurantRating: 1 }),
    review({ orderId: "d", restaurantRating: 1 }),
  ];

  assert.deepEqual(ratingDistribution(rows), [
    { stars: 5, count: 2, share: 0.5 },
    { stars: 4, count: 0, share: 0 },
    { stars: 3, count: 0, share: 0 },
    { stars: 2, count: 0, share: 0 },
    { stars: 1, count: 2, share: 0.5 },
  ]);
});

test("the low filter is exactly 1-2, and an exact score is exact", () => {
  const rows = [
    review({ orderId: "a", restaurantRating: 1 }),
    review({ orderId: "b", restaurantRating: 2 }),
    review({ orderId: "c", restaurantRating: 3 }),
    review({ orderId: "d", restaurantRating: 5 }),
  ];

  assert.deepEqual(
    rows
      .filter((row) => matchesReview(row, { stars: "low" }))
      .map((row) => row.orderId),
    ["a", "b"],
  );
  assert.deepEqual(
    rows
      .filter((row) => matchesReview(row, { stars: 3 }))
      .map((row) => row.orderId),
    ["c"],
  );
  assert.equal(
    rows.filter((row) => matchesReview(row, { stars: "all" })).length,
    4,
  );
});

test("filters by restaurant and searches the comment", () => {
  const rows = [
    review({
      orderId: "a",
      restaurant: "Habhab",
      comment: "Masarap ang baboy",
    }),
    review({ orderId: "b", restaurant: "Lechon House", comment: null }),
  ];

  assert.deepEqual(
    rows
      .filter((row) => matchesReview(row, { restaurant: "Lechon House" }))
      .map((row) => row.orderId),
    ["b"],
  );
  assert.deepEqual(
    rows
      .filter((row) => matchesReview(row, { query: "baboy" }))
      .map((row) => row.orderId),
    ["a"],
  );
  assert.equal(
    rows.filter((row) => matchesReview(row, { query: "" })).length,
    2,
  );
});

test("scoreboard puts the worst shop first and skips a rider nobody scored", () => {
  const rows = [
    review({
      orderId: "a",
      restaurant: "Alonso's",
      restaurantRating: 5,
      rider: "Juan",
      riderRating: 5,
    }),
    review({
      orderId: "b",
      restaurant: "Alonso's",
      restaurantRating: 4,
      rider: "Juan",
      riderRating: 4,
    }),
    review({
      orderId: "c",
      restaurant: "Pikon's",
      restaurantRating: 1,
      rider: "Ana",
      riderRating: null,
    }),
    review({
      orderId: "d",
      restaurant: "Pikon's",
      restaurantRating: 4,
      rider: null,
      riderRating: 2,
    }),
  ];

  const shops = scoreboard(rows, "restaurant");
  assert.deepEqual(
    shops.map((s) => s.name),
    ["Pikon's", "Alonso's"],
  );
  assert.deepEqual(shops[0], {
    name: "Pikon's",
    count: 2,
    average: 2.5,
    low: 1,
  });

  // Ana's review skipped the rider and the last one had no rider recorded:
  // neither counts against anyone.
  assert.deepEqual(scoreboard(rows, "rider"), [
    { name: "Juan", count: 2, average: 4.5, low: 0 },
  ]);
});

test("search matches the rider's name", () => {
  assert.equal(
    matchesReview(review({ rider: "Juan Dela Cruz" }), { query: "dela cruz" }),
    true,
  );
});
