import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STALL_MINUTES,
  formatStallAge,
  stallMinutes,
  stalledRows,
} from "./stuck-orders.ts";

const NOW = new Date("2026-11-17T12:00:00Z");

test("the label constant matches the sweep's threshold", () => {
  assert.equal(STALL_MINUTES, 45);
});

test("a stall's age grows after the sweep wrote it", () => {
  // The sweep stamps minutes at detection; five minutes later that number is
  // stale, so the page counts from the order's own clock instead.
  assert.equal(stallMinutes("2026-11-17T11:15:00Z", NOW), 45);
  assert.equal(stallMinutes("2026-11-17T10:30:00Z", NOW), 90);
});

test("a clock in the future does not read as a negative age", () => {
  assert.equal(stallMinutes("2026-11-17T12:05:00Z", NOW), 0);
});

test("an unparseable timestamp does not produce NaN", () => {
  assert.equal(stallMinutes("not a date", NOW), 0);
});

test("age reads in minutes under an hour and in hours above it", () => {
  assert.equal(formatStallAge(8), "8 min");
  assert.equal(formatStallAge(59), "59 min");
  assert.equal(formatStallAge(60), "1 h");
  assert.equal(formatStallAge(72), "1 h 12 min");
  assert.equal(formatStallAge(145), "2 h 25 min");
});

test("stalled orders are listed oldest first, with the order's own details", () => {
  const rows = stalledRows(
    [
      { orderId: "O-2", riderId: "R-2", stage: "out_for_delivery", stallSince: "2026-11-17T11:40:00Z" },
      { orderId: "O-1", riderId: "R-1", stage: "preparing", stallSince: "2026-11-17T10:00:00Z" },
    ],
    [
      { id: "O-1", reference: "#KFD-1", restaurant: "Kitchen One", rider: "Ana" },
      { id: "O-2", reference: "#KFD-2", restaurant: "Kitchen Two", rider: "Ben" },
    ],
    NOW,
  );
  assert.deepEqual(
    rows.map((r) => [r.reference, r.riderName, r.minutes]),
    [
      ["#KFD-1", "Ana", 120],
      ["#KFD-2", "Ben", 20],
    ],
  );
});

test("a stalled order missing from the page's order list is still shown", () => {
  // Dropping it would hide exactly the order this feature exists to surface.
  const rows = stalledRows(
    [{ orderId: "O-9", riderId: "R-9", stage: "out_for_delivery", stallSince: "2026-11-17T11:00:00Z" }],
    [],
    NOW,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reference, "O-9");
  assert.equal(rows[0].riderName, "R-9");
});
