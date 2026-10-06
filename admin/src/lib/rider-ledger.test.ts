import { test } from "node:test";
import assert from "node:assert/strict";
import { mapPayoutSummary, successRate } from "./rider-ledger.ts";

/**
 * The numbers on /dashboard/riders/[id] used to be orders.total and
 * riders.earnings. orders.total is what the customer paid, so the "earnings"
 * column was a number with nothing to do with earnings. These cover the ledger
 * mapping and the success rate, which is the arithmetic the page does on top.
 */

test("reads the ledger row, defaulting every aggregate to zero", () => {
  // The RPC always returns one row. A rider who has never completed a delivery
  // must read as zeroes, not as a blank screen.
  const summary = mapPayoutSummary(null);
  assert.equal(summary.lifetime, 0);
  assert.equal(summary.earnedToday, 0);
  assert.equal(summary.earnedWeek, 0);
  assert.equal(summary.deliveredCount, 0);
  assert.equal(summary.payoutCount, 0);
  assert.equal(summary.failedCount, 0);
  assert.equal(summary.firstEarnedAt, null);
  assert.equal(summary.lastEarnedAt, null);
});

test("keeps lifetime distinct from the week", () => {
  const summary = mapPayoutSummary({
    lifetime: 4820.5,
    earned_today: 240,
    earned_week: 1150.25,
    delivered_count: 42,
    failed_count: 3,
    payout_count: 39,
    first_earned_at: "2026-01-04T09:00:00Z",
    last_earned_at: "2026-05-15T11:00:00Z",
  });
  assert.equal(summary.lifetime, 4820.5);
  assert.equal(summary.earnedWeek, 1150.25);
  assert.equal(summary.earnedToday, 240);
  assert.equal(summary.deliveredCount, 42);
  assert.equal(summary.payoutCount, 39);
  assert.equal(summary.failedCount, 3);
  assert.equal(summary.firstEarnedAt, "2026-01-04T09:00:00Z");
});

test("treats a null sum as zero rather than NaN", () => {
  // sum() over no rows is null; `null.toFixed` is a white screen.
  const summary = mapPayoutSummary({
    lifetime: null,
    earned_today: null,
    earned_week: null,
    delivered_count: null,
    failed_count: null,
    payout_count: null,
  });
  assert.equal(summary.lifetime, 0);
  assert.equal(summary.deliveredCount, 0);
  assert.equal(summary.payoutCount, 0);
  for (const value of [summary.lifetime, summary.earnedToday, summary.earnedWeek]) {
    assert.equal(Number.isFinite(value), true);
  }
});

test("success rate is delivered over attempted", () => {
  // A failed delivery has no ledger row, so delivery_count alone is a 100%
  // rate for every rider. The denominator needs both.
  assert.equal(successRate({ deliveredCount: 9, failedCount: 1 }), 0.9);
  assert.equal(successRate({ deliveredCount: 3, failedCount: 1 }), 0.75);
});

test("success rate is null when there is nothing to have attempted at all", () => {
  // Not 0 and not 1: a rider with no deliveries and no failures has no rate at
  // all, and 0% would read as "every delivery failed".
  assert.equal(successRate({ deliveredCount: 0, failedCount: 0 }), null);
});

test("a rider who failed everything has a rate of zero, not null", () => {
  // Four failures are four attempts, so the rate is a real 0 rather than an
  // absence of one.
  assert.equal(successRate({ deliveredCount: 0, failedCount: 4 }), 0);
});