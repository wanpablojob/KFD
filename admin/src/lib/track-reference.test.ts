import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeReference, REFERENCE_PATTERN } from "./track-reference.ts";

test("accepts the canonical reference unchanged", () => {
  assert.equal(normalizeReference("#KFD-A1B2C3D4E5F6"), "#KFD-A1B2C3D4E5F6");
});

test("adds the prefix when the customer pastes only the body", () => {
  assert.equal(normalizeReference("A1B2C3D4E5F6"), "#KFD-A1B2C3D4E5F6");
});

test("is case-insensitive and tolerates a bare KFD prefix", () => {
  assert.equal(normalizeReference("kfd-a1b2c3d4e5f6"), "#KFD-A1B2C3D4E5F6");
  assert.equal(normalizeReference("kfdA1B2C3D4E5F6"), "#KFD-A1B2C3D4E5F6");
});

test("strips whitespace copied from a message", () => {
  assert.equal(normalizeReference("  #kfd-a1b2c3d4e5f6  "), "#KFD-A1B2C3D4E5F6");
  assert.equal(normalizeReference("#KFD-A1B2 C3D4 E5F6"), "#KFD-A1B2C3D4E5F6");
});

test("rejects anything that is not 12 hex characters", () => {
  assert.equal(normalizeReference(""), null);
  assert.equal(normalizeReference("#KFD-TOOSHORT"), null);
  assert.equal(normalizeReference("#KFD-A1B2C3D4E5F6AA"), null);
  // G is not a hex digit: the seeded #KFD-10NN references are not trackable.
  assert.equal(normalizeReference("#KFD-GGGGGGGGGGGG"), null);
});

test("the canonical form always satisfies the served pattern", () => {
  const normalized = normalizeReference("a1b2c3d4e5f6");
  assert.ok(normalized);
  assert.ok(REFERENCE_PATTERN.test(normalized));
});
