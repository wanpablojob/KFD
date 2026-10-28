import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReport,
  enumerateDays,
  parseLocalDay,
  presetRange,
  localDayKey,
  shiftDays,
} from "./report-metrics.ts";
import { cents } from "./report-metrics.ts";
import {
  countsAsRevenue as dashboardCounts,
  netRevenue as dashboardNet,
} from "./dashboard-metrics.ts";
import type { Order, OrderStatus } from "./types.ts";

/**
 * The arithmetic behind the Reports page.
 *
 * The failure mode these guard against is a report that looks fine and totals
 * the wrong money: revenue that includes cancelled orders, commission charged
 * on delivery fees, a shop table that does not add up to the KPI above it, or a
 * range that quietly starts a day late because a UTC date was used for a local
 * one. None of those throws.
 */

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    reference: "#KFD-1",
    customer: "Ana",
    restaurant: "Habhab",
    items: [],
    subtotal: 100,
    deliveryFee: 20,
    total: 120,
    status: "delivered" as OrderStatus,
    payment: "cash",
    placedAt: new Date(2026, 9, 2, 12, 0).toISOString(),
    rider: "Rico",
    rejectionReason: null,
    deliveryFailedReason: null,
    deliveryFailedAt: null,
    refunded: 0,
    ...overrides,
  };
}

const FROM = "2026-10-01";
const TO = "2026-10-03";

test("counts delivered orders as revenue and keeps cancelled in the status list only", () => {
  const report = buildReport(
    [
      order({ id: "a", total: 120, subtotal: 100 }),
      order({ id: "b", status: "cancelled", total: 999, subtotal: 999 }),
    ],
    10,
    FROM,
    TO,
  );

  assert.equal(report.totals.orders, 1);
  assert.equal(report.totals.cancelled, 1);
  assert.equal(report.totals.gross, 120);
  assert.deepEqual(
    report.statuses,
    [
      { status: "delivered", count: 1 },
      { status: "cancelled", count: 1 },
    ],
  );
});

test("net revenue subtracts every refunded cent, commission only the food share", () => {
  const report = buildReport([order({ refunded: 30 })], 10, FROM, TO);

  assert.equal(report.totals.gross, 120);
  assert.equal(report.totals.refunds, 30);
  assert.equal(report.totals.netRevenue, 90);
  // Refund is below the food, so it comes off the food: 100 - 30 = 70.
  assert.equal(report.totals.foodSales, 70);
  assert.equal(report.totals.commission, 7);
  assert.equal(report.totals.owedToShops, 63);
});

test("a refund that covered the delivery fee too cannot make food negative", () => {
  // 0138 caps the shop's exposure at the food subtotal, not the order total.
  const report = buildReport(
    [order({ subtotal: 80, deliveryFee: 20, total: 100, refunded: 100 })],
    10,
    FROM,
    TO,
  );

  assert.equal(report.totals.foodSales, 0);
  assert.equal(report.totals.commission, 0);
  assert.equal(report.totals.owedToShops, 0);
  assert.equal(report.totals.netRevenue, 0);
});

test("the shop table adds up to the commission and owed KPIs", () => {
  const report = buildReport(
    [
      order({ id: "a", restaurant: "Habhab", subtotal: 33.33, total: 40.33 }),
      order({ id: "b", restaurant: "Lechon House", subtotal: 66.67, total: 80.67 }),
      order({ id: "c", restaurant: "Habhab", subtotal: 10, total: 15 }),
    ],
    7.5,
    FROM,
    TO,
  );

  const summed = report.shops.reduce(
    (sum, shop) => ({
      commission: sum.commission + shop.commission,
      owed: sum.owed + shop.owed,
    }),
    { commission: 0, owed: 0 },
  );

  assert.equal(report.totals.commission, Math.round(summed.commission * 100) / 100);
  assert.equal(report.totals.owedToShops, Math.round(summed.owed * 100) / 100);
  // Busiest earner first: Lechon House's 80.67 total beats Habhab's 55.33.
  assert.equal(report.shops[0].restaurant, "Lechon House");
});

test("fills every day in the range and ignores an order outside it", () => {
  const report = buildReport(
    [
      order({ id: "in", placedAt: new Date(2026, 9, 2, 9).toISOString() }),
      order({ id: "out", placedAt: new Date(2026, 9, 5, 9).toISOString(), total: 500 }),
    ],
    0,
    FROM,
    TO,
  );

  assert.deepEqual(
    report.days.map((day) => day.date),
    ["2026-10-01", "2026-10-02", "2026-10-03"],
  );
  assert.equal(report.days[0].orders, 0);
  assert.equal(report.days[1].orders, 1);
  assert.equal(report.days[1].netRevenue, 120);
  assert.equal(report.totals.gross, 120);
});

test("average order value is net revenue over delivered orders", () => {
  const report = buildReport(
    [
      order({ id: "a", total: 100, refunded: 10 }),
      order({ id: "b", total: 200, refunded: 0 }),
    ],
    0,
    FROM,
    TO,
  );

  // (90 + 200) / 2
  assert.equal(report.totals.averageOrderValue, 145);
});

test("an empty period reports zeroes, not NaN", () => {
  const report = buildReport([], 10, FROM, TO);

  assert.equal(report.totals.netRevenue, 0);
  assert.equal(report.totals.averageOrderValue, 0);
  assert.equal(report.days.length, 3);
  assert.equal(report.shops.length, 0);
});

test("restates the dashboard's revenue definition, so the two cannot drift", () => {
  const samples = [
    order({ id: "a", total: 120, refunded: 0 }),
    order({ id: "b", total: 200, refunded: 50 }),
    order({ id: "c", status: "cancelled", total: 999 }),
    order({ id: "d", status: "preparing", total: 40 }),
  ];
  const report = buildReport(samples, 0, FROM, TO);
  const expected = samples
    .filter(dashboardCounts)
    .reduce((sum, row) => sum + dashboardNet(row), 0);

  assert.equal(report.totals.netRevenue, cents(expected));
});

test("a range is local days, and an impossible date is not a day", () => {
  // 31 Feb would be rolled into March by `new Date`; it must be rejected.
  assert.equal(parseLocalDay("2026-02-31"), null);
  assert.equal(parseLocalDay("2 Oct 2026"), null);

  const now = new Date(2026, 9, 19, 15, 0);
  assert.deepEqual(presetRange(7, now), { from: "2026-10-13", to: "2026-10-19" });
  assert.deepEqual(enumerateDays("2026-10-18", "2026-10-20"), [
    "2026-10-18",
    "2026-10-19",
    "2026-10-20",
  ]);
  // Reversed ranges are empty rather than infinite.
  assert.deepEqual(enumerateDays("2026-10-20", "2026-10-18"), []);
  assert.equal(localDayKey(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
});

test("shiftDays crosses month and year boundaries and leaves junk alone", () => {
  assert.equal(shiftDays("2026-10-01", -1), "2026-09-30");
  assert.equal(shiftDays("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDays("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDays("not-a-date", -1), "not-a-date");
});
