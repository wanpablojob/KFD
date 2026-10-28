import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchesRefund,
  reasonKey,
  summarizeRefunds,
  type RefundEntry,
} from "./refund-ledger.ts";

/**
 * The refunds ledger's arithmetic and grouping.
 *
 * A breakdown that splits "Wrong item" and "wrong item " into two problems is
 * worse than no breakdown, and a total that ignores the method is useless for
 * reconciling the cash drawer against GCash.
 */

function refund(overrides: Partial<RefundEntry> = {}): RefundEntry {
  return {
    id: 1,
    orderId: "ord_1",
    reference: "#KFD-1",
    customer: "Ana",
    restaurant: "Habhab",
    amount: 50,
    method: "cash",
    reason: "Wrong item",
    createdAt: new Date(2026, 9, 2, 12).toISOString(),
    ...overrides,
  };
}

test("totals, method split and average", () => {
  const summary = summarizeRefunds([
    refund({ id: 1, amount: 50, method: "cash" }),
    refund({ id: 2, amount: 25.5, method: "gcash" }),
    refund({ id: 3, amount: 24.5, method: "gcash" }),
  ]);

  assert.equal(summary.count, 3);
  assert.equal(summary.total, 100);
  assert.equal(summary.cash, 50);
  assert.equal(summary.gcash, 50);
  assert.equal(summary.average, 33.33);
});

test("groups the same reason typed with different case and spacing", () => {
  const summary = summarizeRefunds([
    refund({ id: 1, reason: "Wrong item" }),
    refund({ id: 2, reason: "wrong item " }),
    refund({ id: 3, reason: "WRONG   ITEM" }),
    refund({ id: 4, reason: "Cold food" }),
  ]);

  assert.equal(summary.topReasons.length, 2);
  assert.equal(summary.topReasons[0].reason, "Wrong item");
  assert.equal(summary.topReasons[0].count, 3);
  assert.equal(summary.topReasons[0].total, 150);
  assert.equal(reasonKey("  WRONG   item "), "wrong item");
});

test("an empty reason still appears as a reason", () => {
  const summary = summarizeRefunds([refund({ reason: "   " })]);
  assert.equal(summary.topReasons[0].reason, "No reason given");
});

test("keeps the five largest reasons", () => {
  const summary = summarizeRefunds(
    ["One", "Two", "Three", "Four", "Five", "Six"].map((reason, index) =>
      refund({ id: index + 1, reason }),
    ),
  );
  assert.equal(summary.topReasons.length, 5);
  // All have one row; the tie breaks on money, which is equal here, so the
  // first five inserted stay -- what matters is that the sixth is gone.
  assert.ok(!summary.topReasons.some((row) => row.reason === "Six"));
});

test("filters by method and by a case-insensitive query", () => {
  const rows = [
    refund({ id: 1, method: "cash", customer: "Ana", reason: "Wrong item" }),
    refund({ id: 2, method: "gcash", restaurant: "Lechon House", reason: "Cold food" }),
  ];

  assert.deepEqual(
    rows.filter((row) => matchesRefund(row, { method: "gcash" })).map((row) => row.id),
    [2],
  );
  assert.deepEqual(
    rows.filter((row) => matchesRefund(row, { query: "LECHON" })).map((row) => row.id),
    [2],
  );
  assert.deepEqual(
    rows.filter((row) => matchesRefund(row, { query: "wrong" })).map((row) => row.id),
    [1],
  );
  assert.equal(rows.filter((row) => matchesRefund(row, { method: "all" })).length, 2);
});
