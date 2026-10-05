import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FLAG_META,
  failureRate,
  hasHighFailureRate,
  isLowRating,
  riderFlags,
  LOW_RATING_THRESHOLD,
  MIN_DELIVERIES_FOR_RATE,
} from "./rider-flags.ts";

test("an unrated rider is not a low-rated rider", () => {
  // rating defaults to 0 (0001), so every rider created since sits here until
  // somebody rates them. Flagging them would bury the genuinely low-rated.
  assert.equal(isLowRating(0), false);
});

test("the low-rating threshold is exclusive at the threshold itself", () => {
  assert.equal(isLowRating(LOW_RATING_THRESHOLD), false);
  assert.equal(isLowRating(3.9), true);
  assert.equal(isLowRating(1), true);
});

test("failure rate is failures over everything attempted", () => {
  assert.equal(failureRate(8, 2), 0.2);
  assert.equal(failureRate(1, 0), 0);
  assert.equal(failureRate(0, 0), null);
});

test("a single failed delivery is not enough to flag a rider", () => {
  // 0/1 and 1/1 are both real rates, but a panel listing every new rider is a
  // panel nobody reads.
  assert.equal(hasHighFailureRate(0, 1), false);
  assert.equal(hasHighFailureRate(1, 1), false);
});

test("a sustained failure rate is flagged once the sample is big enough", () => {
  assert.equal(hasHighFailureRate(MIN_DELIVERIES_FOR_RATE, 1), true);
  assert.equal(hasHighFailureRate(9, 1), false);
  assert.equal(hasHighFailureRate(0, 0), false);
});

test("a rider with nothing attempted is never flagged for failures", () => {
  assert.equal(hasHighFailureRate(0, 0), false);
});

test("flags come back in a stable order", () => {
  const flags = riderFlags({
    rating: 2,
    deliveredCount: 10,
    failedCount: 5,
    hasAccount: false,
  });
  assert.deepEqual(flags, ["low_rating", "high_failure", "no_account"]);
});

test("a healthy, linked rider has no flags", () => {
  assert.deepEqual(
    riderFlags({
      rating: 4.8,
      deliveredCount: 40,
      failedCount: 1,
      hasAccount: true,
    }),
    [],
  );
});

test("flag help states the threshold it is warning about", () => {
  // A tooltip that says "low rating" without saying "below what" sends the
  // admin to the rider list to work out the rule.
  assert.match(FLAG_META.low_rating.help, new RegExp(String(LOW_RATING_THRESHOLD)));
  assert.match(FLAG_META.high_failure.help, /20%/);
  assert.match(FLAG_META.no_account.help, /cannot receive offers/i);
});