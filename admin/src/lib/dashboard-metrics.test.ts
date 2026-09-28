import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRevenueSeries,
  periodDelta,
  splitPeriods,
  DAY_MS,
  PERIOD_DAYS,
} from "./dashboard-metrics.ts";
import type { Order, Restaurant } from "./types.ts";

/**
 * Regression tests for the dashboard date maths.
 *
 * These exist because both defects in this file were silent: a chart that
 * plotted all history while claiming "last 7 days", and a KPI whose value was
 * all-time next to a 7-day delta. Neither throws, neither crashes, and the
 * build stays green -- the numbers are just wrong. These are the only checks
 * in the repo that would have caught them.
 */

const NOW = Date.UTC(2026, 8, 28, 12, 0, 0); // Mon 28 Sep 2026, midday UTC

function order(daysAgo: number, total = 100, id = `o${daysAgo}`): Order {
  return {
    id,
    reference: id,
    customer: "Test",
    restaurant: "R",
    items: [],
    subtotal: total,
    deliveryFee: 0,
    total,
    status: "delivered",
    payment: "cash",
    placedAt: new Date(NOW - daysAgo * DAY_MS).toISOString(),
    rider: "",
    rejectionReason: null,
  };
}

function restaurant(joinedDaysAgo: number, status: Restaurant["status"] = "active"): Restaurant {
  return {
    id: `r${joinedDaysAgo}`,
    name: "R",
    cuisine: "C",
    city: "K",
    rating: 4,
    ordersCount: 0,
    revenue: 0,
    status,
    joinedAt: new Date(NOW - joinedDaysAgo * DAY_MS).toISOString(),
    archivedAt: null,
  };
}

// ---------------------------------------------------------------- 2.1

test("periodDelta returns 0 for an empty previous period, not Infinity", () => {
  assert.equal(periodDelta(500, 0), 0);
  assert.equal(periodDelta(0, 0), 0);
});

test("periodDelta computes a signed percentage change", () => {
  assert.equal(periodDelta(150, 100), 50);
  assert.equal(periodDelta(50, 100), -50);
});

test("splitPeriods separates the current window from the one before it", () => {
  const orders = [
    order(1, 100),   // inside current 7d
    order(3, 200),   // inside current 7d
    order(10, 400),  // inside previous 7d
    order(60, 900),  // older than both windows
  ];
  const d = splitPeriods(orders, [], NOW);
  assert.equal(d.revenue.current, 300);
  assert.equal(d.revenue.previous, 400);
  assert.equal(d.orders.current, 2);
  assert.equal(d.orders.previous, 1);
});

test("splitPeriods counts only active restaurants as new", () => {
  const d = splitPeriods(
    [],
    [restaurant(2), restaurant(4, "suspended"), restaurant(9)],
    NOW,
  );
  assert.equal(d.restaurants.current, 1);
  assert.equal(d.restaurants.previous, 1);
});

test("splitPeriods on no data produces zeros, not NaN", () => {
  const d = splitPeriods([], [], NOW);
  assert.equal(d.revenue.current, 0);
  assert.equal(d.revenue.previous, 0);
  assert.equal(periodDelta(d.orders.current, d.orders.previous), 0);
});

// ---------------------------------------------------------------- 2.2

test("buildRevenueSeries always returns exactly 7 points", () => {
  assert.equal(buildRevenueSeries([], NOW).length, PERIOD_DAYS);
  assert.equal(buildRevenueSeries([order(1), order(2)], NOW).length, PERIOD_DAYS);
});

test("buildRevenueSeries discards orders outside the window", () => {
  // 23 days of history used to all appear in a chart labelled "last 7 days".
  // The window is [now - 7d, now), so 8+ days ago is unambiguously outside;
  // exactly 7 days ago is the oldest in-scope bucket and must stay.
  const old = Array.from({ length: 22 }, (_, i) => order(i + 8, 10, `old${i}`));
  const series = buildRevenueSeries(old, NOW);
  assert.equal(series.length, 7);
  assert.equal(
    series.reduce((s, p) => s + p.orders, 0),
    0,
    "no order older than the window may be plotted",
  );
});

test("buildRevenueSeries includes the oldest boundary of the window", () => {
  // Half-open [now-7d, now): exactly 7 days ago is in scope, exactly now is not.
  const series = buildRevenueSeries([order(7, 5, "edge")], NOW);
  assert.equal(series.reduce((s, p) => s + p.orders, 0), 1);
  assert.equal(series[0].revenue, 5);
  assert.equal(buildRevenueSeries([order(0, 5, "now")], NOW).reduce((s, p) => s + p.orders, 0), 0);
});

test("buildRevenueSeries points are in chronological order", () => {
  // Derived rather than hardcoded, so the assertion holds in any timezone:
  // the series must start on the weekday of (now - 7d) and advance one day
  // at a time. The old weekday-index sort produced calendar-week order, which
  // is a different sequence from "last 7 days".
  const labels = buildRevenueSeries([order(1, 10, "a"), order(6, 10, "b")], NOW).map(
    (p) => p.label,
  );
  const all = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const fmt = new Intl.DateTimeFormat("en", { weekday: "short" });
  const startIdx = all.indexOf(fmt.format(new Date(NOW - PERIOD_DAYS * DAY_MS)));
  const expected = Array.from(
    { length: PERIOD_DAYS },
    (_, i) => all[(startIdx + i) % 7],
  );
  assert.deepEqual(labels, expected);
});

test("buildRevenueSeries never repeats a label across 30 days of orders", () => {
  // The original bug: four entries labelled "Mon", clustered by weekday sort.
  const many = Array.from({ length: 30 }, (_, i) => order(i, 10, `d${i}`));
  const labels = buildRevenueSeries(many, NOW).map((p) => p.label);
  assert.equal(new Set(labels).size, 7, `duplicate labels: ${labels.join(",")}`);
});

test("buildRevenueSeries keeps empty days as zero rather than dropping them", () => {
  // 0.5 days ago is comfortably inside the window; exactly 0 sits on the
  // exclusive `now` boundary and is excluded by design.
  const series = buildRevenueSeries([order(0.5, 50)], NOW);
  assert.equal(series.length, 7);
  assert.equal(series.filter((p) => p.orders > 0).length, 1);
  assert.equal(series.filter((p) => p.orders === 0).length, 6);
});

test("buildRevenueSeries sums each day into the right bucket", () => {
  const series = buildRevenueSeries(
    [order(1.5, 100, "a"), order(1.2, 50, "b"), order(0.5, 10, "c")],
    NOW,
  );
  assert.equal(series[5].orders, 2);
  assert.equal(series[5].revenue, 150);
  assert.equal(series[6].orders, 1);
  assert.equal(series[6].revenue, 10);
});

test("buildRevenueSeries handles a window spanning a month boundary", () => {
  const at = Date.UTC(2026, 8, 3, 12, 0, 0); // Thu 3 Sep, window reaches into August
  // Placed relative to `at`, not the module-level NOW, or it lands outside the
  // window being tested.
  const placed = new Date(at - 1.5 * DAY_MS).toISOString();
  const series = buildRevenueSeries([{ ...order(0), placedAt: placed, total: 25 }], at);
  assert.equal(series.length, 7);
  assert.equal(series.reduce((s, p) => s + p.revenue, 0), 25);
  assert.equal(new Set(series.map((p) => p.label)).size, 7);
});

test("the chart and the KPI card agree on which orders are in scope", () => {
  // Both read the same rolling window, so a point in the chart is the same
  // order counted in the "Orders (7d)" value.
  const orders = [order(1, 10, "x"), order(2, 20, "y"), order(20, 99, "z")];
  const d = splitPeriods(orders, [], NOW);
  const plotted = buildRevenueSeries(orders, NOW).reduce((s, p) => s + p.orders, 0);
  assert.equal(d.orders.current, plotted);
});
