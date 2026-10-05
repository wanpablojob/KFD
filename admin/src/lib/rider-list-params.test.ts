import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RIDER_LIST_PARAMS,
  compareRiders,
  parseRiderListParams,
  riderListParamsToSearch,
  viewChangeResetsPage,
} from "./rider-list-params.ts";

test("an empty query string is the default view", () => {
  assert.deepEqual(parseRiderListParams(""), DEFAULT_RIDER_LIST_PARAMS);
});

test("every field round-trips", () => {
  const params = {
    filter: "suspended" as const,
    query: "maria",
    sort: "rating" as const,
    dir: "desc" as const,
    page: 3,
  };
  const search = riderListParamsToSearch(params);
  assert.equal(search, "?status=suspended&q=maria&sort=rating&dir=desc&page=3");
  assert.deepEqual(parseRiderListParams(search), params);
});

test("defaults are omitted so the common URL stays clean", () => {
  assert.equal(riderListParamsToSearch(DEFAULT_RIDER_LIST_PARAMS), "");
});

test("an unknown status or sort falls back instead of blanking the list", () => {
  const parsed = parseRiderListParams("?status=retired&sort=nonsense");
  assert.equal(parsed.filter, "all");
  assert.equal(parsed.sort, "name");
});

test("a nonsense page is corrected rather than trusted", () => {
  assert.equal(parseRiderListParams("?page=0").page, 1);
  assert.equal(parseRiderListParams("?page=-4").page, 1);
  assert.equal(parseRiderListParams("?page=abc").page, 1);
  assert.equal(parseRiderListParams("?page=7").page, 7);
});

test("only 'desc' means descending", () => {
  assert.equal(parseRiderListParams("?dir=desc").dir, "desc");
  assert.equal(parseRiderListParams("?dir=sideways").dir, "asc");
});

test("changing the view resets the page; paging does not", () => {
  const current = { ...DEFAULT_RIDER_LIST_PARAMS, page: 4 };
  assert.equal(viewChangeResetsPage(current, { ...current, filter: "online" }), true);
  assert.equal(viewChangeResetsPage(current, { ...current, sort: "rating" }), true);
  assert.equal(viewChangeResetsPage(current, { ...current, dir: "desc" }), true);
  assert.equal(viewChangeResetsPage(current, { ...current, query: "maria" }), true);
  // Paging is not a view change, or the list could never leave page 1.
  assert.equal(viewChangeResetsPage(current, { ...current, page: 5 }), false);
});

test("missing values always sort last, in both directions", () => {
  // A rider with no current job has to read as absent. Sorting them first would
  // put "Idle" at the head of an idle filter, and in descending order it would
  // also mean reversing the sort changed which riders look urgent.
  const idle = { name: "Idle", current_order_reference: null };
  const busy = { name: "Busy", current_order_reference: "#KFD-1" };

  assert.ok(compareRiders(idle, busy, "current_order_reference", "asc") > 0);
  assert.ok(compareRiders(idle, busy, "current_order_reference", "desc") > 0);
  // ...and the pair still orders between itself once both values exist.
  assert.ok(compareRiders(busy, idle, "current_order_reference", "asc") < 0);
});

test("two missing values compare equal instead of throwing", () => {
  const a = { current_order_reference: null };
  const b = { current_order_reference: "" };
  assert.equal(compareRiders(a, b, "current_order_reference", "asc"), 0);
});

test("numbers compare numerically and direction is honoured", () => {
  const low = { earnings: 9 };
  const high = { earnings: 100 };
  assert.ok(compareRiders(low, high, "earnings", "asc") < 0);
  assert.ok(compareRiders(low, high, "earnings", "desc") > 0);
});

test("text sorting is case-insensitive and numeric-aware", () => {
  const a = { name: "rey 2" };
  const b = { name: "Rey 10" };
  // Plain localeCompare would put "Rey 10" before "Rey 2".
  assert.ok(compareRiders(a, b, "name", "asc") < 0);
  assert.equal(compareRiders({ name: "rey" }, { name: "REY" }, "name", "asc"), 0);
});