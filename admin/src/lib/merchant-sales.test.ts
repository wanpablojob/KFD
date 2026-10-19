import assert from "node:assert/strict";
import { test } from "node:test";
import { salesByDay, totalOf } from "./merchant-sales.ts";

const NOW = new Date(2026, 9, 19, 15, 0); // 19 Oct 2026, local afternoon

test("counts only delivered orders, using the food subtotal", () => {
  const rows = salesByDay(
    [
      { placedAt: new Date(2026, 9, 19, 9).toISOString(), status: "delivered", subtotal: 120.5 },
      { placedAt: new Date(2026, 9, 19, 10).toISOString(), status: "cancelled", subtotal: 999 },
      { placedAt: new Date(2026, 9, 19, 11).toISOString(), status: "pending", subtotal: 999 },
      { placedAt: new Date(2026, 9, 19, 12).toISOString(), status: "delivered", subtotal: 79.5 },
    ],
    7,
    NOW,
  );
  assert.deepEqual(rows[0], { date: "2026-10-19", orders: 2, sales: 200, refunds: 0 });
});

test("deducts refunds from the day's sales and reports them separately", () => {
  const rows = salesByDay(
    [
      { placedAt: new Date(2026, 9, 19, 9).toISOString(), status: "delivered", subtotal: 100, refunded: 30 },
      { placedAt: new Date(2026, 9, 19, 10).toISOString(), status: "delivered", subtotal: 50, refunded: 0 },
    ],
    7,
    NOW,
  );
  assert.deepEqual(rows[0], { date: "2026-10-19", orders: 2, sales: 120, refunds: 30 });
});

test("a refund larger than the food subtotal only removes the food value", () => {
  // The refund RPC caps at the order total, not the food subtotal, so a refund
  // that covered delivery fees too must not push the kitchen's sales negative.
  const rows = salesByDay(
    [{ placedAt: new Date(2026, 9, 19, 9).toISOString(), status: "delivered", subtotal: 80, refunded: 135 }],
    7,
    NOW,
  );
  assert.equal(rows[0].sales, 0);
  assert.equal(rows[0].refunds, 80);
});

test("files a late-evening order under its local day, not the UTC one", () => {
  const rows = salesByDay(
    [{ placedAt: new Date(2026, 9, 18, 23, 30).toISOString(), status: "delivered", subtotal: 50 }],
    3,
    NOW,
  );
  assert.equal(rows[1].date, "2026-10-18");
  assert.equal(rows[1].sales, 50);
  assert.equal(rows[0].sales, 0);
});

test("lists every day newest first, including days with no sales, and ignores older orders", () => {
  const rows = salesByDay(
    [{ placedAt: new Date(2026, 8, 1).toISOString(), status: "delivered", subtotal: 10 }],
    30,
    NOW,
  );
  assert.equal(rows.length, 30);
  assert.equal(rows[0].date, "2026-10-19");
  assert.equal(rows[29].date, "2026-09-20");
  assert.equal(totalOf(rows, 30).sales, 0);
});

test("totals only the requested leading days", () => {
  const rows = salesByDay(
    [
      { placedAt: new Date(2026, 9, 19, 9).toISOString(), status: "delivered", subtotal: 0.1 },
      { placedAt: new Date(2026, 9, 19, 9).toISOString(), status: "delivered", subtotal: 0.2 },
      { placedAt: new Date(2026, 9, 5, 9).toISOString(), status: "delivered", subtotal: 100 },
    ],
    30,
    NOW,
  );
  assert.deepEqual(totalOf(rows, 7), { orders: 2, sales: 0.3, refunds: 0 });
  assert.deepEqual(totalOf(rows, 30), { orders: 3, sales: 100.3, refunds: 0 });
});
