import { test } from "node:test";
import assert from "node:assert/strict";
import { asAppRole, isOperatorRole, roleTargetPath } from "./role-routing.ts";

/**
 * Regression tests for the login landing rule.
 *
 * The defect this guards: an admin signed in at /login?next=/merchant -- the
 * address the merchant gate leaves behind for signed-out visitors -- and was
 * redirected straight to the merchant console. Admins are allowed there, so
 * no gate ever corrected course; the wrong dashboard just sat there.
 *
 * These paths changed when the dashboard moved under /dashboard and the public
 * landing page took over "/". "/" is no longer an admin destination, so the
 * admin fallback is /dashboard and a bare "/" target is discarded.
 */

test("admin ignores a merchant-area target and lands on the admin console", () => {
  assert.equal(roleTargetPath("admin", null, "/merchant"), "/dashboard");
  assert.equal(roleTargetPath("admin", null, "/merchant/orders"), "/dashboard");
});

test("admin with no target lands on the dashboard, not the landing page", () => {
  assert.equal(roleTargetPath("admin", null, null), "/dashboard");
  // "/" is the public marketing page. Honouring it would bounce a signed-in
  // admin out to the landing page, which is a confusing way to end a login.
  assert.equal(roleTargetPath("admin", null, "/"), "/dashboard");
});

test("admin keeps a dashboard target", () => {
  assert.equal(roleTargetPath("admin", null, "/dashboard/orders"), "/dashboard/orders");
  assert.equal(roleTargetPath("admin", null, "/dashboard/riders"), "/dashboard/riders");
  // "/dashboard/merchants" is the admin-only access page, not the merchant
  // portal. It must not be swallowed by the "/merchant" boundary.
  assert.equal(roleTargetPath("admin", null, "/dashboard/merchants"), "/dashboard/merchants");
  assert.equal(roleTargetPath("admin", null, "/dashboard/merchants/abc"), "/dashboard/merchants/abc");
});

test("a pre-move dashboard target is not sent back into the moved area", () => {
  // Old bookmarks pointed at /orders. Those routes no longer exist, so the
  // target is unusable; the admin still ends up somewhere real.
  assert.equal(roleTargetPath("admin", null, "/orders"), "/orders");
  assert.equal(roleTargetPath("admin", null, "/riders"), "/riders");
});

test("merchant stays inside the portal even when the target is outside it", () => {
  assert.equal(roleTargetPath("merchant", "rst_01", null), "/merchant");
  assert.equal(roleTargetPath("merchant", "rst_01", "/merchant/orders"), "/merchant/orders");
  assert.equal(roleTargetPath("merchant", "rst_01", "/"), "/merchant");
  assert.equal(roleTargetPath("merchant", "rst_01", "/orders"), "/merchant");
  assert.equal(roleTargetPath("merchant", "rst_01", "/dashboard/orders"), "/merchant");
});

test("unprovisioned or restricted accounts have no surface at all", () => {
  assert.equal(roleTargetPath(null, null, "/"), null);
  assert.equal(roleTargetPath("merchant", null, "/merchant"), null);
});

/**
 * The bug this guards: `AppRole` was `"admin" | "merchant" | null` and the
 * database value was cast straight into it. `app_role` also holds `customer`
 * and `rider`, so a customer arrived as a role the console believed in, and
 * because `provisioned` was computed as `role !== null`, every customer was
 * routed to /merchant. Reported as "every user turns into merchant".
 */
test("a customer or rider is not an operator and has no console", () => {
  assert.equal(isOperatorRole("customer"), false);
  assert.equal(isOperatorRole("rider"), false);
  assert.equal(isOperatorRole("admin"), true);
  assert.equal(isOperatorRole("merchant"), true);
  assert.equal(isOperatorRole(null), false);
});

test("roleTargetPath gives customers and riders no surface", () => {
  // Every path a login could have been reached from.
  for (const target of [null, "/", "/dashboard", "/dashboard/orders", "/merchant", "/merchant/orders"]) {
    assert.equal(roleTargetPath("customer", null, target), null);
    assert.equal(roleTargetPath("rider", null, target), null);
    // Even holding a restaurant id must not promote a customer.
    assert.equal(roleTargetPath("customer", "rst_01", target), null);
  }
});

test("asAppRole keeps the real role and fails closed on an unknown one", () => {
  assert.equal(asAppRole("admin"), "admin");
  assert.equal(asAppRole("merchant"), "merchant");
  assert.equal(asAppRole("customer"), "customer");
  assert.equal(asAppRole("rider"), "rider");
  // A role added to the enum but not to this list must not become a console.
  assert.equal(asAppRole("dispatcher"), null);
  assert.equal(asAppRole(null), null);
  assert.equal(asAppRole(undefined), null);
  assert.equal(asAppRole(42), null);
});
