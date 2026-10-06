import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapCustomerStatsRow,
  mapCustomerStatsTotals,
} from "./customer-stats.ts";

const LINKED = {
  id: "cus_01",
  user_id: "11111111-1111-1111-1111-111111111111",
  name: "Maria Santos",
  email: "maria@example.com",
  phone: "+63 917 555 0101",
  city: "Kabankalan City Proper",
  joined_at: "2026-01-04",
  archived_at: null,
  blocked_at: null,
  notes: null,
  orders_count: "5",
  delivered_count: "3",
  cancelled_count: "1",
  failed_count: "1",
  total_spend: "1250.50",
  avg_order_value: "416.83",
  last_order_at: "2026-09-30T10:00:00Z",
};

const UNLINKED = {
  ...LINKED,
  user_id: null,
  orders_count: "0",
  delivered_count: "0",
  cancelled_count: "0",
  failed_count: "0",
  total_spend: null,
  avg_order_value: null,
  last_order_at: null,
};

test("maps a linked customer and keeps the server's own numbers", () => {
  const row = mapCustomerStatsRow(LINKED as Record<string, unknown>);
  assert.equal(row.linked, true);
  assert.equal(row.ordersCount, 5);
  assert.equal(row.deliveredCount, 3);
  assert.equal(row.cancelledCount, 1);
  assert.equal(row.failedCount, 1);
  assert.equal(row.totalSpend, 1250.5);
  assert.equal(row.lastOrderAt, "2026-09-30T10:00:00Z");
});

test("bigint counts arrive as strings over PostgREST and are coerced", () => {
  // PostgREST serialises bigint as a JSON string; Number() on "5" is 5, and a
  // NaN here would silently sort a customer to the bottom of the spend column.
  const row = mapCustomerStatsRow({
    ...LINKED,
    orders_count: "5",
  } as Record<string, unknown>);
  assert.equal(row.ordersCount, 5);
});

test("an unlinked row is flagged and its aggregates stay null", () => {
  const row = mapCustomerStatsRow(UNLINKED as Record<string, unknown>);
  assert.equal(row.linked, false);
  assert.equal(row.userId, null);
  // Null, not 0: a seed row must not read as a person who never spent anything.
  assert.equal(row.totalSpend, null);
  assert.equal(row.avgOrderValue, null);
  assert.equal(row.lastOrderAt, null);
});

test("a linked customer who has never ordered reads as a real zero", () => {
  const row = mapCustomerStatsRow({
    ...LINKED,
    orders_count: "0",
    total_spend: "0.00",
    avg_order_value: null,
    last_order_at: null,
  } as Record<string, unknown>);
  assert.equal(row.linked, true);
  assert.equal(row.ordersCount, 0);
  assert.equal(row.totalSpend, 0);
  assert.equal(row.avgOrderValue, null);
});

test("flags and notes survive as dates and free text", () => {
  const row = mapCustomerStatsRow({
    ...LINKED,
    blocked_at: "2026-10-01T09:00:00Z",
    archived_at: "2026-10-02T09:00:00Z",
    notes: "Repeatedly unreachable; call before dispatch.",
  } as Record<string, unknown>);
  assert.equal(row.blockedAt, "2026-10-01T09:00:00Z");
  assert.equal(row.archivedAt, "2026-10-02T09:00:00Z");
  assert.equal(row.notes, "Repeatedly unreachable; call before dispatch.");
});

test("a null phone is an empty string, not the string \"null\"", () => {
  const row = mapCustomerStatsRow({
    ...LINKED,
    phone: null,
  } as Record<string, unknown>);
  assert.equal(row.phone, "");
});

test("totals carry the walk-in figures rather than dropping them", () => {
  const totals = mapCustomerStatsTotals({
    total_customers: "12",
    new_this_month: "3",
    active_this_month: "7",
    walk_in_orders: "4",
    walk_in_spend: "310.00",
  } as Record<string, unknown>);
  assert.deepEqual(totals, {
    totalCustomers: 12,
    newThisMonth: 3,
    activeThisMonth: 7,
    walkInOrders: 4,
    walkInSpend: 310,
  });
});