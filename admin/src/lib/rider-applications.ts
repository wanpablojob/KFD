/**
 * Application queue helpers: how long an applicant has waited, and what to do
 * with the document references they typed.
 */

/** Past this, the queue row is styled as overdue. */
export const APPLICATION_WAITING_WARNING_DAYS = 3;

/**
 * Whole days elapsed, floored.
 *
 * Matches the SQL in 0051's fetch_rider_applications(), which computes
 * waiting_days the same way. The RPC's value is used for display; this exists
 * for the "oldest first" fallback and for tests, so the two must agree -- hence
 * elapsed seconds rather than a date subtraction, which would disagree across
 * timezones.
 */
export function waitingDays(createdAt: string, now: Date = new Date()): number {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.floor((now.getTime() - created) / 86_400_000));
}

export function isWaitingTooLong(days: number): boolean {
  return days >= APPLICATION_WAITING_WARNING_DAYS;
}

/**
 * "Waiting 4 days", not "4d". The number is the point of the column, and
 * spelling it out costs nothing on a queue nobody reads in a hurry.
 */
export function formatWaiting(createdAt: string, now: Date = new Date()): string {
  const days = waitingDays(createdAt, now);
  if (days === 0) return "Today";
  if (days === 1) return "Waiting 1 day";
  return `Waiting ${days} days`;
}

/** Schemes we are willing to turn into a clickable link. */
const SAFE_SCHEMES = new Set(["http:", "https:"]);

export type DocumentKind =
  | { kind: "link"; href: string; label: string }
  | { kind: "text"; label: string }
  | { kind: "missing" };

export interface DocumentField {
  label: string;
  ref: string | null;
}

/**
 * Applicants type document references into three free-text fields. There is no
 * upload (see the rider gap analysis), so a value is either a link somebody
 * pasted or an opaque identifier like "LIC-2024-8891".
 *
 * A value is only linkified when `new URL()` accepts it *and* the scheme is
 * http or https. `javascript:` and `data:` parse fine as URLs and would run or
 * render if passed to href, so the scheme check is the security boundary here,
 * not the parse.
 *
 * Anything else stays text and says so, rather than rendering a dead link.
 */
export function classifyDocumentRef(
  ref: string | null,
  label: string,
): DocumentKind {
  const value = (ref ?? "").trim();
  if (!value) return { kind: "missing" };

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { kind: "text", label: value };
  }

  if (!SAFE_SCHEMES.has(parsed.protocol)) {
    return { kind: "text", label: value };
  }

  return { kind: "link", href: parsed.toString(), label };
}

/**
 * `noopener noreferrer` on every document link: the target is applicant-supplied
 * and could be anything, including a page that reads back through window.opener.
 */
export const EXTERNAL_LINK_PROPS = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;