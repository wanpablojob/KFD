import { test } from "node:test";
import assert from "node:assert/strict";
import {
  customerOrderScope,
  CUSTOMER_ORDER_COLUMNS,
} from "./customer-orders.ts";

test("reads a customer's orders by auth id, never by name", () => {
  // The regression this file exists for. The detail page used to resolve the
  // customer out of the whole list and then ask for orders by that NAME:
  //
  //   fetchOrdersByCustomer(customers?.find((c) => c.id === id)?.name ?? "")
  //
  // useAsyncData captures its fetcher once on mount, so that ran before the
  // customers query resolved and went out with "" -- and could never be
  // corrected, because nothing re-ran it. The column is not configurable, so a
  // future edit cannot quietly reintroduce the join on a free-text name.
  const scope = customerOrderScope("11111111-1111-1111-1111-111111111111");
  assert.deepEqual(scope, {
    column: "customer_user_id",
    value: "11111111-1111-1111-1111-111111111111",
  });
});

test("an unlinked customer cannot be queried at all", () => {
  // A row with no user_id (a 0001 seed row) has no orders of its own. Returning
  // null means the caller has nothing to query; the old empty-string fallback
  // was a query that matched nothing and looked like a customer with no orders.
  assert.equal(customerOrderScope(null), null);
  assert.equal(customerOrderScope(undefined), null);
  assert.equal(customerOrderScope(""), null);
  assert.equal(customerOrderScope("   "), null);
});

test("surrounding whitespace is trimmed, because the id is used as a value", () => {
  assert.equal(
    customerOrderScope("  abc  ")?.value,
    "abc",
  );
});

test("the projection includes the customer columns the detail page needs", () => {
  // delivery_address and rejection_reason are what make an order row readable in
  // context; a projection that drops them silently degrades the table.
  assert.ok(CUSTOMER_ORDER_COLUMNS.includes("customer_user_id"));
  assert.ok(CUSTOMER_ORDER_COLUMNS.includes("delivery_address"));
  assert.ok(CUSTOMER_ORDER_COLUMNS.includes("rejection_reason"));
  assert.ok(CUSTOMER_ORDER_COLUMNS.includes("delivery_failed_at"));
});