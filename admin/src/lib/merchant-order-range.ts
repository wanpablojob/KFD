/**
 * Local-time date presets for the merchant Orders filter.
 *
 * The filter this replaces compared `orders.placed_at` -- a full ISO timestamp
 * from PostgREST -- against date-only strings produced by
 * `toISOString().split("T")[0]`. That is wrong twice over, and the two mistakes
 * point in opposite directions:
 *
 *   1. `toISOString()` converts to UTC. Manila is UTC+8, so local midnight is
 *      16:00 UTC the *previous* day. "Today" therefore had a lower bound one day
 *      early, and orders the merchant reads as yesterday-evening appeared under
 *      Today while orders placed shortly before local midnight today could fall
 *      outside it.
 *
 *   2. Lexicographic comparison of a timestamp against "YYYY-MM-DD" only works
 *      by accident of ISO ordering, and stops working as soon as the bound is
 *      not a bare UTC date.
 *
 * Both are avoided the same way: a day boundary is a local-midnight `Date`, and
 * membership is decided by comparing instants. Nothing here parses or formats a
 * timestamp as a string, so there is no timezone left to get wrong.
 *
 * `from` is inclusive, `to` exclusive, and adjacent presets share a boundary
 * instant -- so an order at exactly local midnight belongs to the later bucket
 * and every order falls in exactly one.
 */

export type DateRangeBounds = { from: Date | null; to: Date | null };

/** Local midnight on the given day, as an instant. */
function localMidnight(day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate());
}

function addDays(day: Date, count: number): Date {
  const next = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  next.setDate(next.getDate() + count);
  return next;
}

/**
 * The named presets the filter offers. `now` is injected so this is a pure
 * function and the tests can pin it.
 */
export function orderDatePresets(now: Date): {
  today: DateRangeBounds;
  yesterday: DateRangeBounds;
  week: DateRangeBounds;
  month: DateRangeBounds;
} {
  const todayStart = localMidnight(now);
  const yesterdayStart = addDays(todayStart, -1);

  // getDay() is 0 for Sunday, so subtracting it walks back to the local Sunday.
  const weekStart = addDays(todayStart, -todayStart.getDay());
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

  return {
    today: { from: todayStart, to: addDays(todayStart, 1) },
    yesterday: { from: yesterdayStart, to: todayStart },
    week: { from: weekStart, to: addDays(todayStart, 1) },
    month: { from: monthStart, to: addDays(todayStart, 1) },
  };
}

/**
 * True when `placedAt` falls inside the bounds.
 *
 * A null or empty range includes everything. An unparseable timestamp is
 * excluded from a real range -- a row with no readable date cannot honestly
 * claim to be inside "today" -- but callers showing an unfiltered list still see
 * it, because there is no range to exclude it from.
 *
 * Every preset supplies its own upper bound, so nothing here needs `now`.
 *
 * `to` is exclusive, so every preset's upper bound is the next preset's lower
 * bound and an instant at local midnight belongs to exactly one day.
 */
export function isWithinRange(
  placedAt: string,
  range: DateRangeBounds | null,
): boolean {
  if (!range || (range.from == null && range.to == null)) return true;

  const at = new Date(placedAt);
  if (Number.isNaN(at.getTime())) return false;

  if (range.from != null && at.getTime() < range.from.getTime()) return false;
  // `to` is exclusive, so a preset can never include a row from a skewed clock.
  if (range.to != null && at.getTime() >= range.to.getTime()) return false;

  return true;
}

/**
 * An `<input type="date">` value ("2026-09-24") as local midnight.
 *
 * `new Date("2026-09-24")` parses that string as UTC midnight, which is 8am in
 * Manila -- so a custom range starting on the 24th would silently skip the first
 * eight hours of the 24th. Same class of bug as the presets, reached by a
 * different door, so it is fixed the same way: parse the parts as local.
 *
 * Returns null for anything unparseable so a half-typed date cannot narrow the
 * list to nothing.
 */
export function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  // Rejects overflow like 2026-02-30, which Date would roll into March.
  if (Number.isNaN(date.getTime())) return null;
  if (date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) return null;
  return date;
}

/** End of the local day named by a date input, as an exclusive bound. */
export function endOfLocalDay(value: string): Date | null {
  const start = parseLocalDate(value);
  if (!start) return null;
  return addDays(start, 1);
}