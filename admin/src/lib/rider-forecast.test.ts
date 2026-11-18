import { test } from "node:test";
import assert from "node:assert/strict";
import { forecastRiders } from "./rider-forecast.ts";
import type { Order } from "./types.ts";

// Wednesday 18 Nov 2026, 15:00 local.
const now = new Date(2026, 10, 18, 15, 0);

let n = 0;
function order(
  daysAgo: number,
  hour: number,
  extra: Partial<Order> = {},
): Order {
  const placed = new Date(2026, 10, 18 - daysAgo, hour, 10);
  n += 1;
  return {
    id: `o${n}`,
    reference: `#KFD-${n}`,
    customer: "C",
    restaurant: "R",
    items: [],
    subtotal: 100,
    deliveryFee: 45,
    total: 150,
    status: "delivered",
    payment: "cash",
    placedAt: placed.toISOString(),
    rider: "",
    rejectionReason: null,
    deliveryFailedReason: null,
    deliveryFailedAt: null,
    deliveredAt: new Date(placed.getTime() + 30 * 60000).toISOString(),
    ...extra,
  };
}

test("uses the same weekday, recent weeks weighted most", () => {
  // Noon on the last three Wednesdays: 6, 2 and 2 orders.
  const orders = [
    ...Array.from({ length: 6 }, () => order(7, 12)),
    ...Array.from({ length: 2 }, () => order(14, 12)),
    ...Array.from({ length: 2 }, () => order(21, 12)),
    order(0, 9),
  ];
  const f = forecastRiders(orders, now);
  assert.equal(f.basis, "same-weekday");
  assert.equal(f.samples, 3);
  // (4*6 + 3*2 + 2*2) / (4+3+2) = 34/9 = 3.8 orders at noon.
  assert.equal(f.hours[12].forecast, 3.8);
  // 3.8 orders/h x 0.5 h (30 min deliveries) = 1.9 in progress / 2 jobs -> 1 rider.
  assert.equal(f.deliveryMinutes, 30);
  assert.equal(f.hours[12].ridersNeeded, 1);
  assert.equal(f.hours[9].actual, 1);
  assert.equal(f.hours[3].ridersNeeded, 0);
});

test("a busy hour needs more than one rider", () => {
  const orders = [7, 14].flatMap((d) =>
    Array.from({ length: 12 }, () => order(d, 18)),
  );
  const f = forecastRiders(orders, now);
  // 12 orders/h x 0.5 h = 6 in progress / 2 = 3 riders, at 6pm.
  assert.equal(f.hours[18].ridersNeeded, 3);
  assert.equal(f.peakRiders, 3);
  assert.equal(f.peakHour, 18);
});

test("with little history it falls back to recent days, and to nothing with none", () => {
  const recent = forecastRiders([order(1, 12), order(2, 12)], now);
  assert.equal(recent.basis, "recent-days");
  assert.equal(recent.samples, 2);
  assert.equal(recent.hours[12].forecast, 1);

  const empty = forecastRiders([], now);
  assert.equal(empty.basis, "none");
  assert.equal(empty.peakRiders, 0);
  assert.equal(empty.peakHour, null);
  assert.equal(empty.deliveryMinutes, 40);
});

test("cancelled orders never needed a rider", () => {
  const orders = [7, 14].flatMap((d) => [
    order(d, 12, { status: "cancelled" }),
  ]);
  assert.equal(forecastRiders(orders, now).hours[12].forecast, 0);
});
