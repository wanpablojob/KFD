import assert from "node:assert/strict";
import test from "node:test";
import {
  checkRateLimit,
  resetRateLimit,
} from "./server/rate-limit.ts";

test("allows exactly the limit, then refuses", () => {
  resetRateLimit();
  const t = 1_000_000;
  for (let i = 0; i < 3; i++) {
    assert.equal(checkRateLimit("k", 3, 60_000, t + i).allowed, true);
  }
  const refused = checkRateLimit("k", 3, 60_000, t + 4);
  assert.equal(refused.allowed, false);
  assert.ok(refused.retryAfterSeconds >= 1);
});

test("the window slides: the oldest hit expires first", () => {
  resetRateLimit();
  const t = 2_000_000;
  assert.equal(checkRateLimit("k", 2, 60_000, t).allowed, true);
  assert.equal(checkRateLimit("k", 2, 60_000, t + 30_000).allowed, true);
  // Third call inside the window is refused.
  assert.equal(checkRateLimit("k", 2, 60_000, t + 30_001).allowed, false);
  // At t + 60_001 the first hit (at t) has left the window; the second has not.
  assert.equal(checkRateLimit("k", 2, 60_000, t + 60_001).allowed, true);
});

test("keys are independent", () => {
  resetRateLimit();
  const t = 3_000_000;
  assert.equal(checkRateLimit("a", 1, 60_000, t).allowed, true);
  assert.equal(checkRateLimit("a", 1, 60_000, t + 1).allowed, false);
  assert.equal(checkRateLimit("b", 1, 60_000, t + 1).allowed, true);
});

test("reset clears one key without touching the others", () => {
  resetRateLimit();
  const t = 4_000_000;
  checkRateLimit("a", 1, 60_000, t);
  checkRateLimit("b", 1, 60_000, t);
  resetRateLimit("a");
  assert.equal(checkRateLimit("a", 1, 60_000, t + 1).allowed, true);
  assert.equal(checkRateLimit("b", 1, 60_000, t + 1).allowed, false);
});
