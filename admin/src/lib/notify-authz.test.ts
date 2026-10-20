import { test } from "node:test";
import assert from "node:assert/strict";
import { mayNotifyOrder, type CallerScope } from "./notify-authz.ts";

const admin: CallerScope = { userId: "u-admin", role: "admin", restaurantId: null };
const merchant: CallerScope = {
  userId: "u-merchant",
  role: "merchant",
  restaurantId: "rst_1",
};
const customer: CallerScope = {
  userId: "u-customer",
  role: "customer",
  restaurantId: null,
};

/** The customer's order at rst_1. */
const ownOrder = { restaurantId: "rst_1", customerUserId: "u-customer" };
/** A legacy/walk-in order with no account attached. */
const legacyOrder = { restaurantId: "rst_1", customerUserId: null };

test("an admin may notify about either event", () => {
  assert.equal(mayNotifyOrder("placed", admin, ownOrder), true);
  assert.equal(mayNotifyOrder("status_changed", admin, ownOrder), true);
  // Also for a restaurant the admin is not attached to.
  assert.equal(
    mayNotifyOrder("status_changed", admin, {
      restaurantId: "rst_other",
      customerUserId: "u-other",
    }),
    true,
  );
});

test("a merchant may report a status change for their own restaurant", () => {
  assert.equal(mayNotifyOrder("status_changed", merchant, ownOrder), true);
});

test("a merchant may not report a status change for another restaurant", () => {
  assert.equal(
    mayNotifyOrder("status_changed", merchant, {
      restaurantId: "rst_other",
      customerUserId: "u-other",
    }),
    false,
  );
});

test("a merchant may not announce a new order, even at their own restaurant", () => {
  // This is the fabrication case: a merchant could otherwise mail their own
  // customers a "new order" that does not exist.
  assert.equal(mayNotifyOrder("placed", merchant, ownOrder), false);
});

test("a customer may announce their own order", () => {
  assert.equal(mayNotifyOrder("placed", customer, ownOrder), true);
});

test("a customer may not announce somebody else's order", () => {
  assert.equal(
    mayNotifyOrder("placed", customer, {
      restaurantId: "rst_1",
      customerUserId: "u-other",
    }),
    false,
  );
});

test("a customer may not announce an order with no account attached", () => {
  assert.equal(mayNotifyOrder("placed", customer, legacyOrder), false);
});

test("a customer may not request status mail", () => {
  assert.equal(mayNotifyOrder("status_changed", customer, ownOrder), false);
});

test("a caller with no app_users row gets nothing", () => {
  const stranger: CallerScope = { userId: "u-stranger", role: null, restaurantId: null };
  assert.equal(mayNotifyOrder("placed", stranger, ownOrder), false);
  assert.equal(mayNotifyOrder("status_changed", stranger, ownOrder), false);
});

const rider: CallerScope = { userId: "u-rider", role: "rider", restaurantId: null };
const assigned = (status: string) => ({ ...ownOrder, riderUserId: "u-rider", status });

test("the assigned rider may announce pickup and delivery", () => {
  assert.equal(mayNotifyOrder("status_changed", rider, assigned("out_for_delivery")), true);
  assert.equal(mayNotifyOrder("status_changed", rider, assigned("delivered")), true);
});

test("a rider may not announce kitchen statuses, other riders' orders, or new orders", () => {
  assert.equal(mayNotifyOrder("status_changed", rider, assigned("confirmed")), false);
  assert.equal(mayNotifyOrder("status_changed", rider, assigned("cancelled")), false);
  assert.equal(
    mayNotifyOrder("status_changed", rider, { ...assigned("delivered"), riderUserId: "u-other" }),
    false,
  );
  assert.equal(mayNotifyOrder("placed", rider, assigned("delivered")), false);
});
