import { test } from "node:test";
import assert from "node:assert/strict";
import { portalMenu, type PortalSession } from "./portal-menu.ts";

const OUT: PortalSession = { signedIn: false, roleLoading: false, isAdmin: false, isMerchant: false };
const keys = (s: PortalSession) => portalMenu(s).portals.map((p) => p.key);

test("signed out: every sign-in choice, routed through /login", () => {
  const menu = portalMenu(OUT);
  assert.equal(menu.mode, "sign-in");
  assert.deepEqual(keys(OUT), ["admin", "merchant", "customer"]);
  assert.ok(menu.portals.filter((p) => p.key !== "customer").every((p) => p.href.startsWith("/login?next=")));
});

test("admin: both portals and the tracker, linked directly", () => {
  const s = { ...OUT, signedIn: true, isAdmin: true };
  assert.deepEqual(keys(s), ["admin", "merchant", "customer"]);
  assert.equal(portalMenu(s).portals[0].href, "/dashboard");
});

test("merchant: never offered the admin console", () => {
  const s = { ...OUT, signedIn: true, isMerchant: true };
  assert.deepEqual(keys(s), ["merchant", "customer"]);
});

test("a customer or rider account: only the tracker", () => {
  assert.deepEqual(keys({ ...OUT, signedIn: true }), ["customer"]);
});

test("while the role loads, no portal shows, even for an admin", () => {
  assert.deepEqual(keys({ ...OUT, signedIn: true, roleLoading: true, isAdmin: true }), ["customer"]);
});
