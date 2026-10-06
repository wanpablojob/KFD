import { test } from "node:test";
import assert from "node:assert/strict";
import { mapCustomerSummary, paymentMixShares } from "./customer-summary.ts";

test("maps the counts and the address list", () => {
  const summary = mapCustomerSummary({
    statusCounts: { delivered: 4, cancelled: 1, pending: 1 },
    paymentCounts: { cash: 3, e_wallet: 2, card: 1 },
    recentAddresses: [
      { address: "12 Katipunan St., Barangay Poblacion", times: 4, lastUsed: "2026-09-30T10:00:00Z" },
      { address: "3 Rizal Ave., Barangay Mandaue", times: 2, lastUsed: "2026-08-02T09:00:00Z" },
    ],
  });

  assert.deepEqual(summary.statusCounts, {
    delivered: 4,
    cancelled: 1,
    pending: 1,
  });
  assert.equal(summary.recentAddresses.length, 2);
  assert.equal(summary.recentAddresses[0].times, 4);
  assert.equal(summary.empty, false);
});

test("a customer who has never ordered reads as empty, not as broken", () => {
  const summary = mapCustomerSummary({
    statusCounts: {},
    paymentCounts: {},
    recentAddresses: [],
  });
  assert.equal(summary.empty, true);
  assert.deepEqual(summary.recentAddresses, []);
});

test("a null payload does not throw", () => {
  // The RPC returns jsonb, so a missing/renamed key arrives as undefined rather
  // than as a type error. The page must still render.
  for (const bad of [null, undefined, "nope", 42, []]) {
    const summary = mapCustomerSummary(bad);
    assert.deepEqual(summary.statusCounts, {});
    assert.deepEqual(summary.recentAddresses, []);
  }
});

test("a blank address is dropped rather than rendered as an empty row", () => {
  const summary = mapCustomerSummary({
    statusCounts: { delivered: 1 },
    paymentCounts: {},
    recentAddresses: [
      { address: "   ", times: 1, lastUsed: "2026-01-01T00:00:00Z" },
      { address: "Real address", times: 1, lastUsed: "2026-01-01T00:00:00Z" },
      null,
      "not an object",
    ],
  });
  assert.equal(summary.recentAddresses.length, 1);
  assert.equal(summary.recentAddresses[0].address, "Real address");
});

test("nonsense counts are discarded, not rendered as NaN%", () => {
  const summary = mapCustomerSummary({
    statusCounts: { delivered: "3", cancelled: "many", pending: 0, preparing: -2 },
    paymentCounts: {},
    recentAddresses: [],
  });
  // "3" is coerced because PostgREST serialises numerics as strings; the
  // others are dropped, because a zero or negative share is not a fact.
  assert.deepEqual(summary.statusCounts, { delivered: 3 });
});

test("payment shares are computed from the counts and sorted by volume", () => {
  const shares = paymentMixShares({ cash: 3, e_wallet: 1 });
  assert.deepEqual(
    shares.map((s) => [s.key, s.share, s.label]),
    [
      ["cash", 0.75, "cash"],
      ["e_wallet", 0.25, "e wallet"],
    ],
  );
});

test("payment shares of nothing are zero, not NaN", () => {
  const shares = paymentMixShares({});
  assert.deepEqual(shares, []);
  assert.equal(paymentMixShares({ cash: 0 }).every((s) => s.share === 0), true);
});