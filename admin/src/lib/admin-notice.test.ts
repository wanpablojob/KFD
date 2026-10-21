import { test } from "node:test";
import assert from "node:assert/strict";
import { applicationNotice, refundNotice, suspensionNotice } from "./admin-notice";

test("an applicant hears the outcome, and nothing while pending", () => {
  assert.equal(applicationNotice({ status: "approved", decision_note: null })?.title, "You're a KFD rider");
  assert.equal(
    applicationNotice({ status: "rejected", decision_note: " Blurry licence " })?.body,
    "Your rider application was not approved. Note: Blurry licence",
  );
  assert.equal(applicationNotice({ status: "pending", decision_note: null }), null);
});

test("a refund names the amount, order and method, and routes to the order", () => {
  const n = refundNotice({ amount: 50, method: "gcash", reference: "#KFD-1" });
  assert.equal(n.body, "₱50.00 for order #KFD-1 is being refunded by GCash.");
  assert.deepEqual(n.data, { reference: "#KFD-1" });
});

test("suspension is read from the saved row", () => {
  assert.match(
    suspensionNotice({ suspended_at: "2026-10-21", suspended_reason: "Late cash" }).body,
    /Reason: Late cash/,
  );
  assert.equal(suspensionNotice({ suspended_at: null, suspended_reason: null }).title, "You're back on");
});
