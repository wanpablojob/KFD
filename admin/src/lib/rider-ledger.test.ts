import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDisputable,
  mapPayouts,
  mapPayoutSummary,
  reviewWindowRemaining,
  successRate,
  type RiderPayout,
} from "./rider-ledger.ts";

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
  for (const value of [
    summary.lifetime,
    summary.earnedToday,
    summary.earnedWeek,
  ]) {
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
// ---------------------------------------------------------------------------
// 0075: the 24-hour dispute window
// ---------------------------------------------------------------------------
// The state is what makes a disputed delivery visible. Without it the ledger row
// looks like any other and the operator has no reason to look at it; the whole
// recovery path depends on this mapping surfacing 'disputed' rather than
// quietly defaulting it to something ordinary.

function payout(over: Partial<RiderPayout> = {}): RiderPayout {
  return {
    orderId: "o1",
    reference: "KFD-1",
    restaurant: "R",
    amount: 25,
    earnedAt: "2026-01-01T00:00:00Z",
    settlementState: "pending_review",
    reviewExpiresAt: null,
    disputeReason: null,
    disputedAt: null,
    ...over,
  };
}

test("maps the settlement state off the RPC row", () => {
  const rows = mapPayouts([
    { order_id: "a", settlement_state: "disputed" },
    { order_id: "b", settlement_state: "settled" },
    { order_id: "c", settlement_state: "reversed" },
  ]);
  assert.equal(rows[0].settlementState, "disputed");
  assert.equal(rows[1].settlementState, "settled");
  assert.equal(rows[2].settlementState, "reversed");
});

test("an absent or unknown state reads as still under review, not as settled", () => {
  // Both directions of a wrong default are dangerous: calling an unrecognised
  // state 'settled' would hide a dispute, and dropping the row would hide the
  // money. pending_review is the safe middle -- visible, and not yet final.
  const rows = mapPayouts([
    { order_id: "a" },
    { order_id: "b", settlement_state: "something_new" },
    { order_id: "c", settlement_state: null },
  ]);
  for (const row of rows) assert.equal(row.settlementState, "pending_review");
});

test("carries the dispute reason and expiry through", () => {
  const [row] = mapPayouts([
    {
      order_id: "a",
      settlement_state: "disputed",
      review_expires_at: "2026-01-02T00:00:00Z",
      dispute_reason: "Wrong address, food never arrived.",
      disputed_at: "2026-01-01T12:00:00Z",
    },
  ]);
  assert.equal(row.reviewExpiresAt, "2026-01-02T00:00:00Z");
  assert.equal(row.disputeReason, "Wrong address, food never arrived.");
  assert.equal(row.disputedAt, "2026-01-01T12:00:00Z");
});

test("a payout is disputable only inside its window", () => {
  const now = new Date("2026-01-02T00:00:00Z");
  assert.equal(
    isDisputable(payout({ reviewExpiresAt: "2026-01-03T00:00:00Z" }), now),
    true,
  );
  // Exactly at expiry is closed: the window is 24 hours, not 24 hours and a bit.
  assert.equal(
    isDisputable(payout({ reviewExpiresAt: "2026-01-02T00:00:00Z" }), now),
    false,
  );
  assert.equal(
    isDisputable(payout({ reviewExpiresAt: "2026-01-01T00:00:00Z" }), now),
    false,
  );
});

test("a disputed or reversed payout is never disputable again", () => {
  const future = "2026-06-01T00:00:00Z";
  for (const state of ["disputed", "settled", "reversed"] as const) {
    assert.equal(
      isDisputable(payout({ settlementState: state, reviewExpiresAt: future })),
      false,
    );
  }
});

test("a missing or unparseable expiry is treated as never disputable", () => {
  // Deliberate, and the opposite of the state fallback above. An unknown state
  // might be a new dispute state, so it stays visible; an unknown expiry means
  // the window cannot be shown to have closed, and letting an unverifiable row
  // be disputed is the worse failure.
  assert.equal(isDisputable(payout({ reviewExpiresAt: null })), false);
  assert.equal(isDisputable(payout({ reviewExpiresAt: "not a date" })), false);
});

test("the review window label counts down in the units an operator needs", () => {
  const now = new Date("2026-01-02T00:00:00Z");
  assert.equal(reviewWindowRemaining("2026-01-02T05:30:00Z", now), "5h left");
  assert.equal(reviewWindowRemaining("2026-01-02T00:20:00Z", now), "20m left");
  // Seconds from closing reads as a minute, not "0m", which would look closed.
  assert.equal(reviewWindowRemaining("2026-01-02T00:00:30Z", now), "1m left");
  assert.equal(reviewWindowRemaining("2026-01-02T00:00:00Z", now), "window closed");
  assert.equal(reviewWindowRemaining("2026-01-01T00:00:00Z", now), "window closed");
});

test("no expiry or a bad one yields no label rather than NaN", () => {
  assert.equal(reviewWindowRemaining(null), null);
  assert.equal(reviewWindowRemaining("not a date"), null);
});
