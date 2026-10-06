import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TIER_THRESHOLDS,
  tierForSpend,
  tierLabelFor,
} from "./customer-tier.ts";

test("a customer with no linked account has no tier", () => {
  // The regression the page had: an unlinked seed row arrived with the seed
  // total_spend constant and was ranked "Standard", i.e. a spending history had
  // been invented for a fixture.
  assert.equal(tierForSpend(null), null);
  assert.equal(tierLabelFor(null), "Not linked");
  assert.equal(tierLabelFor(undefined), "Not linked");
});

test("a real zero is still a tier: the customer ordered and spent nothing", () => {
  // Zero means "linked, spent nothing", which is different from "unknown". A
  // refund-only or fully discounted history lands here.
  assert.equal(tierForSpend(0), "Standard");
});

test("the thresholds are inclusive at the boundary", () => {
  assert.equal(tierForSpend(TIER_THRESHOLDS.silver), "Silver");
  assert.equal(tierForSpend(TIER_THRESHOLDS.silver - 0.01), "Standard");
  assert.equal(tierForSpend(TIER_THRESHOLDS.gold), "Gold");
  assert.equal(tierForSpend(TIER_THRESHOLDS.gold - 0.01), "Silver");
});

test("below silver is Standard", () => {
  assert.equal(tierForSpend(199.99), "Standard");
});

test("a very large spend does not overflow into a missing tier", () => {
  assert.equal(tierForSpend(1_000_000), "Gold");
});

test("NaN is not a spend and gets no tier", () => {
  // A NaN comparison is false, so a naive `>= 400` chain would fall through to
  // "Standard" and quietly rank a broken row.
  assert.equal(tierForSpend(Number.NaN), null);
});

test("the thresholds are the documented ones", () => {
  // Pinned so a retune is a deliberate edit to a test, not an accident.
  assert.deepEqual(TIER_THRESHOLDS, { gold: 400, silver: 200 });
});