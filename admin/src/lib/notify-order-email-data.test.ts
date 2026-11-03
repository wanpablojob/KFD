import assert from "node:assert/strict";
import test from "node:test";
import { orderEmailData } from "./notify-order-email-data.ts";

/**
 * Regression: a trip notify (`deliveryId` only) has no order row. Before the
 * null-safe builder this threw at `order.restaurant`, so every basket checkout
 * silently skipped the merchant mail/push and the customer receipt.
 */
test("a trip-only notify builds data instead of throwing", () => {
  const data = orderEmailData(null, {
    reference: "#KFD-FA58F152C6BB",
    customer: "costumer",
    total: "152.00",
  });

  assert.equal(data.reference, "#KFD-FA58F152C6BB");
  assert.equal(data.customer, "costumer");
  assert.equal(data.restaurant, "");
  assert.deepEqual(data.items, []);
  assert.equal(data.total, 152);
});

test("a single order uses its own restaurant, items, and total", () => {
  const data = orderEmailData(
    {
      reference: "#KFD-637A6ED8CF2C",
      restaurant: "Habhab (Kabankalan)",
      customer: "costumer",
      items: [{ name: "Bulalo", quantity: 1, price: 120 }],
      total: 152,
    },
    {
      reference: "#KFD-FA58F152C6BB",
      customer: "costumer",
      total: 999,
    }
  );

  assert.equal(data.reference, "#KFD-637A6ED8CF2C");
  assert.equal(data.restaurant, "Habhab (Kabankalan)");
  assert.equal(data.items.length, 1);
  assert.equal(data.total, 152);
});

test("neither row present degrades to blanks, never NaN", () => {
  const data = orderEmailData(null, null);

  assert.equal(data.reference, "");
  assert.equal(data.customer, "");
  assert.equal(data.total, 0);
});
