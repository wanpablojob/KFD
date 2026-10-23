import { test } from "node:test";
import assert from "node:assert/strict";
import { describeAudit, type AuditRow } from "./audit.ts";

const base: AuditRow = {
  table_name: null,
  action: "update",
  event: null,
  rider_id: null,
  account_email: null,
  old_role: null,
  new_role: null,
  old_restaurant_id: null,
  new_restaurant_id: null,
  detail: null,
};

test("rider events read as sentences, with their reason or amount", () => {
  assert.equal(
    describeAudit({
      ...base,
      event: "rider.suspended",
      rider_id: "R-1",
      detail: { reason: "Late cash" },
    }),
    "Suspended rider R-1: Late cash",
  );
  assert.equal(
    describeAudit({
      ...base,
      event: "rider.payouts_paid",
      rider_id: "R-1",
      detail: { total: 75, count: 2, method: "gcash", reference: "123" },
    }),
    "Paid rider R-1 ₱75.00 for 2 deliveries by GCash 123",
  );
  assert.equal(
    describeAudit({ ...base, event: "rider.new_thing", rider_id: "R-1" }),
    "rider.new_thing R-1",
  );
});

test("account changes say what changed", () => {
  assert.equal(
    describeAudit({
      ...base,
      action: "insert",
      account_email: "a@b.c",
      new_role: "merchant",
    }),
    "Gave a@b.c the merchant role",
  );
  assert.equal(
    describeAudit({
      ...base,
      account_email: "a@b.c",
      old_role: "customer",
      new_role: "merchant",
      new_restaurant_id: "RS-1",
    }),
    "Changed a@b.c: role customer → merchant, restaurant none → RS-1",
  );
});
