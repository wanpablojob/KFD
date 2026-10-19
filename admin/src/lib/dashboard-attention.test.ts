import assert from "node:assert/strict";
import { test } from "node:test";
import { attentionItems, liveCounts, topRestaurants } from "./dashboard-attention.ts";

const NOW = new Date(2026, 9, 20, 12, 0);
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const order = (status: string, placedMinsAgo: number, rider = "", failed = false) => ({
  status,
  placedAt: minsAgo(placedMinsAgo),
  rider,
  deliveryFailedAt: failed ? minsAgo(1) : null,
});

const none = { disputedPayouts: 0, pendingApplications: 0, deletionRequests: 0 };

test("nothing to do is an empty list, not a list of zeros", () => {
  assert.deepEqual(attentionItems({ orders: [order("delivered", 60, "Ana")], ...none }, NOW), []);
});

test("a pending order counts as unanswered only after the threshold", () => {
  const items = attentionItems(
    { orders: [order("pending", 9), order("pending", 10), order("pending", 30)], ...none },
    NOW,
  );
  assert.deepEqual(items.map((i) => [i.key, i.count]), [["unanswered", 2]]);
});

test("accepted orders without a rider, and open failed deliveries, are flagged", () => {
  const items = attentionItems(
    {
      orders: [
        order("confirmed", 5),
        order("preparing", 5, "Ana"),
        order("out_for_delivery", 20, "Ben", true),
        order("cancelled", 20, "", true),
      ],
      ...none,
    },
    NOW,
  );
  assert.deepEqual(items.map((i) => [i.key, i.count]), [["no-rider", 1], ["failed", 1]]);
});

test("queues come after the urgent items", () => {
  const items = attentionItems(
    { orders: [order("pending", 30)], disputedPayouts: 2, pendingApplications: 1, deletionRequests: 1 },
    NOW,
  );
  assert.deepEqual(items.map((i) => i.key), ["unanswered", "disputes", "applications", "deletions"]);
  assert.deepEqual(items.map((i) => i.urgent), [true, false, false, false]);
});

test("live counts group the kitchen stages", () => {
  assert.deepEqual(
    liveCounts([{ status: "pending" }, { status: "confirmed" }, { status: "preparing" }, { status: "out_for_delivery" }, { status: "delivered" }]),
    { pending: 1, kitchen: 2, onTheRoad: 1 },
  );
});

test("top restaurants rank the window's delivered orders by the given value", () => {
  const sale = (restaurant: string, daysAgo: number, total: number, status = "delivered") => ({
    restaurant,
    status,
    total,
    placedAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
  });
  const rows = topRestaurants(
    [
      sale("Inasal House", 1, 300),
      sale("Inasal House", 2, 200),
      sale("Piaya Corner", 1, 400),
      sale("Piaya Corner", 1, 999, "cancelled"),
      sale("Old Favourite", 30, 5000),
    ],
    NOW,
    7,
    (o) => o.total,
  );
  assert.deepEqual(rows, [
    { name: "Inasal House", orders: 2, revenue: 500 },
    { name: "Piaya Corner", orders: 1, revenue: 400 },
  ]);
});
