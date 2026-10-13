import { MAX_FOOTER_META_LENGTH, footerMeta, shortTimestamp } from "./order-timestamp";

/**
 * The delivery card footer that overflowed.
 *
 * It rendered `new Date(...).toLocaleString()` next to the payout in a
 * space-between row. That string is ~256pt at the caption size; with the payout
 * text and a 16pt gap the row needed ~398pt inside a 335pt card, so the date ran
 * off the edge of an iPhone SE.
 *
 * The fix pins a fixed-width format, so every branch is asserted on length as
 * well as content. A future edit that reintroduces a variable-width field fails
 * here rather than on a phone.
 */

const NOW = new Date("2026-10-07T14:05:00");

test("today shows the time, with no date at all", () => {
  expect(shortTimestamp("2026-10-07T14:05:00", NOW)).toBe("Today 14:05");
  // Late evening is still today.
  expect(shortTimestamp("2026-10-07T23:59:00", NOW)).toBe("Today 23:59");
  // Just after midnight is today too.
  expect(shortTimestamp("2026-10-07T00:01:00", NOW)).toBe("Today 00:01");
});

test("yesterday is named rather than dated", () => {
  expect(shortTimestamp("2026-10-06T09:30:00", NOW)).toBe("Yesterday 09:30");
});

test("anything older shows day and month, and never the year", () => {
  expect(shortTimestamp("2026-10-05T08:00:00", NOW)).toBe("5 Oct 08:00");
  expect(shortTimestamp("2025-12-31T23:59:00", NOW)).toBe("31 Dec 23:59");
  // A year ago still fits, which is the whole reason the year was dropped.
  expect(shortTimestamp("2025-10-07T14:05:00", NOW)).toBe("7 Oct 14:05");
});

test("23:50 last night reads as yesterday, not today", () => {
  // The bug this guards: comparing elapsed hours instead of calendar days calls
  // this "today" for eleven hours.
  const justAfterMidnight = new Date("2026-10-07T00:10:00");
  expect(shortTimestamp("2026-10-06T23:50:00", justAfterMidnight)).toBe(
    "Yesterday 23:50"
  );
});

test("a month boundary is compared by calendar day", () => {
  const endOfMonth = new Date("2026-10-01T09:00:00");
  expect(shortTimestamp("2026-09-30T21:00:00", endOfMonth)).toBe("Yesterday 21:00");
});

test("time is always 24-hour and zero-padded", () => {
  expect(shortTimestamp("2026-10-07T09:05:00", NOW)).toBe("Today 09:05");
  expect(shortTimestamp("2026-10-07T00:00:00", NOW)).toBe("Today 00:00");
  expect(shortTimestamp("2026-10-07T13:00:00", NOW)).toBe("Today 13:00");
});

test("an unparseable timestamp renders as nothing rather than 'Invalid Date'", () => {
  expect(shortTimestamp("", NOW)).toBe("");
  expect(shortTimestamp("not a date", NOW)).toBe("");
  expect(shortTimestamp("2026-13-45T99:99:99", NOW)).toBe("");
});

test("the footer meta is one string, so the row cannot be handed two overflowing children", () => {
  const meta = footerMeta("Cash on delivery", "2026-10-07T14:05:00", NOW);
  expect(meta).toBe("Cash on delivery · Today 14:05");
});

test("footer meta keeps the payment label when the date is unusable", () => {
  // The label is the useful half; losing it to a bad timestamp would be worse
  // than showing a date we cannot read.
  expect(footerMeta("e-wallet", "nonsense", NOW)).toBe("e-wallet");
});

test("every format stays inside the width the card can actually show", () => {
  // The regression guard. The overflow was ~63pt on a 375pt screen, so this
  // asserts the whole right-hand side rather than each branch alone.
  const cases = [
    "2026-10-07T14:05:00", // today
    "2026-10-06T09:30:00", // yesterday
    "2026-10-05T08:00:00", // dated
    "2024-02-29T23:59:00", // leap day, a year back
  ];
  for (const iso of cases) {
    const meta = footerMeta("Cash on delivery", iso, NOW);
    expect(meta.length).toBeLessThanOrEqual(MAX_FOOTER_META_LENGTH);
  }
});

test("the longest possible date form is day-month-time, 12 characters", () => {
  // "31 Dec 23:59" -- pins the shape so a future field cannot lengthen it.
  // Two-digit day + space + three-letter month + space + HH:MM = 12.
  const longest = shortTimestamp(
    "2026-12-31T23:59:00",
    new Date("2027-06-01T00:00:00")
  );
  expect(longest).toBe("31 Dec 23:59");
  expect(longest.length).toBe(12);
});
