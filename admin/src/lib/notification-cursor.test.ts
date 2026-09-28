import assert from "node:assert/strict";
import { test } from "node:test";
import { isUnreadSince } from "./notification-cursor.ts";

/**
 * The unread rule, which replaced a component-local `useState` that reset on
 * every reload. These are the boundaries that matter: an operator who has
 * acknowledged everything must see nothing, and one second either side of the
 * mark must not be decided by string comparison.
 */

const AT = "2026-09-28T10:00:00.000Z";

test("a null cursor means everything is unread", () => {
  assert.equal(isUnreadSince(AT, null), true);
  assert.equal(isUnreadSince("2020-01-01T00:00:00.000Z", null), true);
});

test("an order placed after the mark is unread", () => {
  assert.equal(isUnreadSince("2026-09-28T10:00:00.001Z", AT), true);
  assert.equal(isUnreadSince("2026-09-29T10:00:00.000Z", AT), true);
});

test("an order placed before the mark is read", () => {
  assert.equal(isUnreadSince("2026-09-28T09:59:59.999Z", AT), false);
  assert.equal(isUnreadSince("2020-01-01T00:00:00.000Z", AT), false);
});

test("the mark itself is read, not unread", () => {
  // The cursor is stamped with now() at the moment of acknowledgement, and an
  // order can share that exact instant. Treating it as unread would leave a dot
  // that never clears for an order placed in the same millisecond.
  assert.equal(isUnreadSince(AT, AT), false);
});

test("an unparseable placed_at is treated as read, not as unread", () => {
  // The safe direction: a badge that wrongly claims there is news sends an
  // operator looking for an order that is not there. A missing badge does not.
  assert.equal(isUnreadSince("not-a-date", AT), false);
});

test("comparison is by instant, not by string order", () => {
  // "2026-09-28T9:00" sorts after "2026-09-28T10:00" as a string, so a naive
  // comparison would mark a morning order unread against a later cursor.
  assert.equal(isUnreadSince("2026-09-28T9:00:00.000Z", AT), false);
});
