/**
 * Order timestamps, short enough to fit.
 *
 * The delivery card's footer is a row: the rider's payout on one side, the
 * payment method and the time on the other. That second half was rendered with
 * `new Date(...).toLocaleString()`, which produces "Cash on Delivery ·
 * 9/24/2026, 10:50:00 AM" -- roughly 256pt at the caption size. Add the payout
 * text and a 16pt gap and the row needs ~398pt inside a 335pt card, so on an
 * iPhone SE the date ran off the edge of the screen.
 *
 * toLocaleString is also unpredictable here: its output length varies by locale
 * and by platform, and an "en-GB" build yields "24/09/2026, 10:50:00" while a
 * 12-hour locale adds " AM". A layout that only fits in some of those is a
 * layout that breaks in the rest.
 *
 * So this formats explicitly and the format is pinned: day and month name, no
 * year (a rider does not need it and it is five characters), 24-hour time, and
 * "today"/"yesterday" when the order is recent -- which is the overwhelmingly
 * common case on a screen that shows a rider's current work.
 *
 * Fixed character width is the point. Every branch is asserted against a fixed
 * length so a future edit that reintroduces a variable-width field fails here
 * rather than on a phone in a rider's hand.
 */

/** "Today, 14:05" style bounds. Never longer than this. */
const MAX_LENGTH = 15;

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function daysBetween(from: Date, to: Date): number {
  // Compare calendar days, not elapsed hours: an order placed at 23:50 is
  // "yesterday" for eleven hours of the next day, and rounding on raw
  // milliseconds would call it today.
  const utcFrom = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const utcTo = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((utcTo - utcFrom) / 86_400_000);
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * A short, fixed-width timestamp for the delivery card footer.
 *
 * `now` is injected so this stays a pure function and the tests can pin it.
 * Returns "" for an unparseable input: the row then renders only the payment
 * method, which is better than showing "Invalid Date".
 */
export function shortTimestamp(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const age = daysBetween(date, now);

  // "today" and "yesterday" are the common cases and the shortest honest answer.
  // Beyond that the day and month are what a rider needs; the year is not, and
  // omitting it is what keeps this inside MAX_LENGTH.
  if (age === 0) return `Today ${time}`;
  if (age === 1) return `Yesterday ${time}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${time}`;
}

/**
 * The whole right-hand side of the footer, joined so it cannot overflow.
 *
 * Exported because the join is part of the fix, not a detail of the screen: the
 * payment label and the time are one string, so the row can never be handed two
 * independently-measured children that together exceed the card.
 */
export function footerMeta(
  paymentLabel: string,
  placedAtIso: string,
  now?: Date
): string {
  const time = shortTimestamp(placedAtIso, now);
  if (!time) return paymentLabel;
  return `${paymentLabel} · ${time}`;
}

/** The longest string this module can produce, for the layout assertion. */
export const MAX_FOOTER_META_LENGTH = MAX_LENGTH + "Cash on delivery · ".length;
