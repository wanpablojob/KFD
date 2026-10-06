import { test } from "node:test";
import assert from "node:assert/strict";
import { mapRiderOrderRows, riderOrderScope } from "./rider-orders.ts";

/**
 * These cover the contract that item 1 fixed, and they failed before it did.
 *
 * The original detail page resolved the rider's *name* from the overview query
 * and asked for orders by that name. Two things were wrong with it: the name is
 * not unique (two riders called Maria Santos share a delivery history), and the
 * value was never available in time, so the query went out with "" and matched
 * nothing. The second one was structural -- useAsyncData captures its fetcher
 * once, so passing a value derived from another query's result runs that fetch
 * against the pre-result value forever.
 *
 * `riderOrderScope` is the piece that makes that failure impossible to write
 * again: there is no way to build an orders query without a resolved rider id,
 * and the column is rider_id rather than the name.
 */

test("refuses to build a query without a resolved rider id", () => {
  // This is the bug. The old fetcher ran with name === "" on first render, and
  // because the fetcher is captured once, nothing ever corrected it.
  assert.equal(riderOrderScope(null), null);
  assert.equal(riderOrderScope(""), null);
  assert.equal(riderOrderScope("   "), null);
});

test("scopes by rider_id, not by the rider's name", () => {
  // orders.rider_id has existed since migration 0025 and is what the rider-side
  // RLS policy ("riders read assigned orders") already matches on. Matching the
  // name is what made two same-named riders share a history.
  assert.deepEqual(riderOrderScope("rdr_01"), {
    column: "rider_id",
    value: "rdr_01",
  });
});

test("keeps the id exactly as given, trimmed only", () => {
  // No lowercasing: ids are opaque, and two ids differing only in case would be
  // silently conflated by one that normalises them.
  assert.equal(riderOrderScope("  rdr_01  ")?.value, "rdr_01");
  assert.equal(riderOrderScope("RDR_01")?.value, "RDR_01");
});

test("maps a row and keeps the nullable columns nullable", () => {
  const rows = mapRiderOrderRows([
    {
      id: "ord_1",
      reference: "#KFD-1001",
      customer: "Ana Reyes",
      restaurant: "Kusina Na Clara",
      restaurant_id: "rst_1",
      items: [{ name: "Adobo", quantity: 2, price: 150 }],
      subtotal: 300,
      delivery_fee: 40,
      total: 340,
      status: "delivered",
      payment: "cash",
      placed_at: "2026-05-01T10:00:00Z",
      rider: "Ana Reyes",
      rider_id: "rdr_01",
      rider_payout: 120,
      delivery_address: "12 Rizal St",
      delivery_failed_reason: null,
      delivery_failed_at: null,
      delivery_failed_by: null,
      rejection_reason: null,
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "ord_1");
  assert.equal(rows[0].riderPayout, 120);
  assert.equal(rows[0].riderId, "rdr_01");
  assert.equal(rows[0].deliveryFailedReason, null);
  assert.equal(rows[0].items.length, 1);
});

test("maps null rider_payout to null rather than zero", () => {
  // Zero is a real payout -- a waived fee. Collapsing null into 0 would tell an
  // admin the rider earned nothing when the truth is that no fee was frozen.
  const [row] = mapRiderOrderRows([
    { id: "ord_1", reference: "r", customer: "c", restaurant: "r2", items: [], rider_payout: null },
  ]);
  assert.equal(row.riderPayout, null);
});

test("maps a delivered order's failure reason back to null", () => {
  // Columns 0044 added are absent on most rows, so a missing key must read the
  // same as an explicit null rather than as the string "undefined".
  const [row] = mapRiderOrderRows([
    { id: "ord_1", reference: "r", customer: "c", restaurant: "r2", items: [] },
  ]);
  assert.equal(row.deliveryFailedReason, null);
  assert.equal(row.deliveryFailedAt, null);
  assert.equal(row.deliveryFailedBy, null);
});

test("keeps a failure reason and who reported it", () => {
  const [row] = mapRiderOrderRows([
    {
      id: "ord_1",
      reference: "r",
      customer: "c",
      restaurant: "r2",
      items: [],
      delivery_failed_reason: "Customer not answering",
      delivery_failed_at: "2026-05-02T09:00:00Z",
      delivery_failed_by: "rdr_01",
    },
  ]);
  assert.equal(row.deliveryFailedReason, "Customer not answering");
  assert.equal(row.deliveryFailedBy, "rdr_01");
  assert.equal(row.deliveryFailedAt, "2026-05-02T09:00:00Z");
});

test("maps an empty row list to an empty list", () => {
  assert.deepEqual(mapRiderOrderRows([]), []);
  assert.deepEqual(mapRiderOrderRows(null), []);
});