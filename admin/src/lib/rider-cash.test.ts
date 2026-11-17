import { test } from "node:test";
import assert from "node:assert/strict";
import { cashOnHandTotal, ridersHoldingCash } from "./rider-cash.ts";
import type { RiderCashPosition } from "./types.ts";

function cash(
  riderId: string,
  riderName: string,
  onHand: number,
): RiderCashPosition {
  return {
    riderId,
    riderName,
    collected: onHand,
    handedOver: 0,
    onHand,
    flagged: 0,
    deliveries: 1,
  };
}

test("a rider who handed everything in is not on the cash list", () => {
  const rows = ridersHoldingCash([
    cash("a", "Ana", 0),
    cash("b", "Ben", 250),
  ]);
  assert.deepEqual(
    rows.map((row) => row.riderName),
    ["Ben"],
  );
});

test("rounding noise is not cash", () => {
  // A few centavos left over from splitting a payment must not put a rider on
  // a collection list that an admin has to chase.
  assert.equal(ridersHoldingCash([cash("a", "Ana", 0.004)]).length, 0);
});

test("the biggest amount comes first", () => {
  const rows = ridersHoldingCash([
    cash("a", "Ana", 100),
    cash("b", "Ben", 900),
    cash("c", "Cara", 300),
  ]);
  assert.deepEqual(
    rows.map((row) => row.riderName),
    ["Ben", "Cara", "Ana"],
  );
});

test("the total is the sum of what the riders hold", () => {
  assert.equal(
    cashOnHandTotal([cash("a", "Ana", 100), cash("b", "Ben", 250)]),
    350,
  );
});
