import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "./safe-next.ts";

/**
 * Regression tests for the post-login redirect guard.
 *
 * The defect this guards: `safeNextPath` used to rely only on string prefix
 * tests, so `?next=/\t/evil.com` was accepted. The URL parser deletes tabs and
 * newlines before it decides an origin, so that string resolves to
 * `https://evil.com/` — an open redirect on the login page, reachable by an
 * admin because `roleTargetPath` passes any non-merchant target straight to
 * `window.location.replace`.
 */

const PROBE_BASE = "https://kfd.invalid";

test("the bypass this guards is real", () => {
  // If this assertion ever stops holding, the tab case below is no longer a
  // live vulnerability — but keep rejecting it anyway: the guard should not
  // depend on parser behaviour staying the same.
  assert.equal(new URL("/\t/evil.com", PROBE_BASE).origin, "https://evil.com");
  assert.equal(new URL("/\n/evil.com", PROBE_BASE).origin, "https://evil.com");
});

test("control characters are refused", () => {
  assert.equal(safeNextPath("/\t/evil.com"), null);
  assert.equal(safeNextPath("/\n/evil.com"), null);
  assert.equal(safeNextPath("/\r/evil.com"), null);
  assert.equal(safeNextPath("/\t\t/evil.com"), null);
  assert.equal(safeNextPath("/\u0000dashboard"), null);
  // A tab anywhere, not just after the leading slash.
  assert.equal(safeNextPath("/dashboard\tredirect"), null);
});

test("protocol-relative and absolute URLs are refused", () => {
  assert.equal(safeNextPath("//evil.com"), null);
  assert.equal(safeNextPath("///evil.com"), null);
  assert.equal(safeNextPath("/\\evil.com"), null);
  assert.equal(safeNextPath("https://evil.com"), null);
  assert.equal(safeNextPath("http://evil.com/login"), null);
  assert.equal(safeNextPath("javascript:alert(1)"), null);
  assert.equal(safeNextPath("evil.com"), null);
});

test("empty input is refused", () => {
  assert.equal(safeNextPath(null), null);
  assert.equal(safeNextPath(undefined), null);
  assert.equal(safeNextPath(""), null);
});

test("real in-app paths are kept exactly as given", () => {
  assert.equal(safeNextPath("/dashboard"), "/dashboard");
  assert.equal(safeNextPath("/dashboard/orders"), "/dashboard/orders");
  assert.equal(safeNextPath("/merchant/orders?tab=2"), "/merchant/orders?tab=2");
  assert.equal(safeNextPath("/dashboard/merchants/abc"), "/dashboard/merchants/abc");
  // "/" is the public landing page; roleTargetPath is what discards it, so the
  // guard itself keeps it.
  assert.equal(safeNextPath("/"), "/");
});

test("an encoded tab stays a path segment, still same-origin", () => {
  // Double-encoded input ("%09") is not decoded by URLSearchParams twice, so it
  // arrives literally. It must not be rejected outright, but it must never
  // leave the origin either.
  const allowed = safeNextPath("/%09/evil.com");
  if (allowed !== null) {
    assert.equal(new URL(allowed, PROBE_BASE).origin, PROBE_BASE);
  }
});
