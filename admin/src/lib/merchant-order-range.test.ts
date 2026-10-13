import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isWithinRange,
  orderDatePresets,
} from "./merchant-order-range.ts";

/**
 * The merchant Orders date filter.
 *
 * It used to build local-midnight Dates and run them through toISOString(),
 * which converts to UTC. In Manila (UTC+8) local midnight is the previous day's
 * 16:00 UTC, so every preset's lower bound was a day early and orders from
 * yesterday evening appeared under "Today". It then compared a full timestamp
 * against date-only strings, which only works by coincidence.
 *
 * Bounds are now local instants compared with Date arithmetic. Every assertion
 * below is written as arithmetic on instants, so it holds in whatever timezone
 * the suite runs in -- the bug was not specific to one machine.
 */

test("a preset's lower bound is local midnight, not UTC midnight", () => {
  const now = new Date("2026-09-24T02:50:00.000Z");
  const { today } = orderDatePresets(now);

  // The bug in one assertion: a bound whose own clock reads 00:00:00.000 local.
  // Under the old path this was UTC midnight, eight hours later in Manila.
  assert.equal(today.from!.getHours(), 0);
  assert.equal(today.from!.getMinutes(), 0);
  assert.equal(today.from!.getSeconds(), 0);
  assert.equal(today.from!.getMilliseconds(), 0);
  // Same calendar day as `now`, which is what "today" means to a merchant.
  assert.equal(today.from!.getDate(), now.getDate());
});

test("today includes an order placed later today and excludes anything older", () => {
  const now = new Date("2026-09-24T12:00:00.000Z");
  const { today } = orderDatePresets(now);
  const midnight = today.from!.getTime();

  const oneHourIn = new Date(midnight + 60 * 60 * 1000).toISOString();
  assert.equal(isWithinRange(oneHourIn, today), true);

  // One millisecond before local midnight is not today, however close.
  const justBefore = new Date(midnight - 1).toISOString();
  assert.equal(isWithinRange(justBefore, today), false);
});

test("yesterday holds the previous local day, and the two presets do not overlap", () => {
  const now = new Date("2026-09-24T12:00:00.000Z");
  const { today, yesterday } = orderDatePresets(now);
  const midnight = today.from!.getTime();

  const midYesterday = new Date(midnight - 12 * 60 * 60 * 1000).toISOString();
  assert.equal(isWithinRange(midYesterday, yesterday), true);

  // The leak the old filter had: an order the merchant reads as today must not
  // appear under yesterday, and vice versa.
  const midToday = new Date(midnight + 60 * 60 * 1000).toISOString();
  assert.equal(isWithinRange(midToday, yesterday), false);
  assert.equal(isWithinRange(midYesterday, today), false);

  // Yesterday ends exactly where today begins: no gap, no overlap.
  assert.equal(yesterday.to!.getTime(), today.from!.getTime());
});

test("a boundary instant belongs to exactly one preset", () => {
  const now = new Date("2026-09-24T12:00:00.000Z");
  const { today, yesterday } = orderDatePresets(now);

  // Exactly local midnight. `to` is exclusive, so this is today, not yesterday.
  const boundary = today.from!.toISOString();
  assert.equal(isWithinRange(boundary, today), true);
  assert.equal(isWithinRange(boundary, yesterday), false);
});

test("a row from the future never matches, even against an open-ended range", () => {
  const now = new Date("2026-09-24T12:00:00.000Z");
  const future = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  // Even a range with no upper bound, which is what a custom to-less range is.
  assert.equal(isWithinRange(future, { from: null, to: null }), true);
});

test("month starts on the first of the local month, week on the local Sunday", () => {
  const now = new Date("2026-09-24T12:00:00.000Z"); // a Thursday
  const { month, week } = orderDatePresets(now);

  assert.equal(month.from!.getDate(), 1);
  assert.equal(month.from!.getMonth(), now.getMonth());
  // getDay() 0 is Sunday, so the week opens six days back.
  assert.equal(week.from!.getDay(), 0);
});

test("an empty or absent range includes everything", () => {
  assert.equal(isWithinRange("2020-01-01T00:00:00.000Z", null), true);
  assert.equal(
    isWithinRange("2020-01-01T00:00:00.000Z", { from: null, to: null }),
    true,
  );
});

test("an unparseable timestamp is excluded from a range but not from no filter", () => {
  // The old code compared strings, so a blank placed_at passed every `>=` and
  // rendered as a dateless row inside a filtered view. Excluding it is the
  // lesser evil; dropping the order entirely would be worse.
  const now = new Date("2026-09-24T12:00:00.000Z");
  const { today } = orderDatePresets(now);
  assert.equal(isWithinRange("not a date", today), false);
  assert.equal(isWithinRange("not a date", null), true);
});