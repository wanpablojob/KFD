import assert from "node:assert/strict";
import { test } from "node:test";
import { itemSummary, minutesWaiting, todayStats } from "./merchant-today.ts";

const NOW = new Date(2026, 9, 20, 12, 0);
const at = (h: number, m = 0, day = 20) => new Date(2026, 9, day, h, m).toISOString();

test("today's sales are the food subtotal, cancelled and earlier days excluded", () => {
  const stats = todayStats(
    [
      { placedAt: at(9), status: "delivered", subtotal: 150 },
      { placedAt: at(10), status: "pending", subtotal: 80.5 },
      { placedAt: at(11), status: "cancelled", subtotal: 999 },
      { placedAt: at(23, 0, 19), status: "delivered", subtotal: 999 },
    ],
    NOW,
  );
  assert.deepEqual(stats, { orders: 2, sales: 230.5, pending: 1 });
});

test("minutes waiting rounds down and never goes negative", () => {
  assert.equal(minutesWaiting(at(11, 52), NOW), 8);
  assert.equal(minutesWaiting(at(12, 5), NOW), 0);
});

test("item summary lists quantity and name", () => {
  assert.equal(
    itemSummary([
      { name: "Chicken Inasal", quantity: 2 },
      { name: "Rice", quantity: 1 },
    ]),
    "2× Chicken Inasal, 1× Rice",
  );
});
