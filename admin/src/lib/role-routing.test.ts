import { test } from "node:test";
import assert from "node:assert/strict";
import { roleTargetPath } from "./role-routing.ts";

/**
 * Regression tests for the login landing rule.
 *
 * The defect this guards: an admin signed in at /login?next=/merchant -- the
 * address the merchant gate leaves behind for signed-out visitors -- and was
 * redirected straight to the merchant console. Admins are allowed there, so
 * no gate ever corrected course; the wrong dashboard just sat there.
 */

test("admin ignores a merchant-area target and lands on the admin console", () => {
  assert.equal(roleTargetPath("admin", null, "/merchant"), "/");
  assert.equal(roleTargetPath("admin", null, "/merchant/orders"), "/");
});

test("admin keeps an admin-area or root target", () => {
  assert.equal(roleTargetPath("admin", null, null), "/");
  assert.equal(roleTargetPath("admin", null, "/"), "/");
  assert.equal(roleTargetPath("admin", null, "/orders"), "/orders");
  // "/merchants" is the admin-only access page, not the merchant portal.
  // It must not be swallowed by the "/merchant" boundary.
  assert.equal(roleTargetPath("admin", null, "/merchants"), "/merchants");
  assert.equal(roleTargetPath("admin", null, "/merchants/abc"), "/merchants/abc");
});

test("merchant stays inside the portal even when the target is outside it", () => {
  assert.equal(roleTargetPath("merchant", "rst_01", null), "/merchant");
  assert.equal(roleTargetPath("merchant", "rst_01", "/merchant/orders"), "/merchant/orders");
  assert.equal(roleTargetPath("merchant", "rst_01", "/"), "/merchant");
  assert.equal(roleTargetPath("merchant", "rst_01", "/orders"), "/merchant");
});

test("unprovisioned or restricted accounts have no surface at all", () => {
  assert.equal(roleTargetPath(null, null, "/"), null);
  assert.equal(roleTargetPath("merchant", null, "/merchant"), null);
});