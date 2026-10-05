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
// ---------------------------------------------------------------------------
// Document checks
//
// Stored in the application's decision_note rather than in new columns: the note
// is already free text the applicant can see on a rejection, it is already
// preserved, and adding three booleans to rider_applications would mean a
// migration plus every read path for a three-value record. The markers below are
// the contract; parseDecisionNote() reads them back.
// ---------------------------------------------------------------------------

export const DOCUMENT_CHECKS = [
  { key: "licence_legible", label: "Licence legible" },
  { key: "orcr_matches_vehicle", label: "ORCR matches vehicle" },
  { key: "id_matches_name", label: "ID matches name" },
] as const;

export type DocumentCheckKey = (typeof DOCUMENT_CHECKS)[number]["key"];

const CHECK_MARKER_PREFIX = "Documents checked:";

export type DecisionNoteParts = {
  checks: DocumentCheckKey[];
  overridden: boolean;
  note: string;
};

/**
 * Builds what goes into rider_applications.decision_note.
 *
 * The checklist line is always written when anything was ticked or overridden,
 * so a later reader can tell "nobody checked anything" from "everything passed".
 * `overridden` is spelled out rather than implied by a short checklist, because
 * an approval that skipped a check is the one an auditor needs to find.
 */
export function composeDecisionNote(parts: DecisionNoteParts): string | undefined {
  const label = (key: DocumentCheckKey) =>
    DOCUMENT_CHECKS.find((check) => check.key === key)?.label ?? key;

  const lines: string[] = [];

  if (parts.checks.length > 0) {
    const passed = parts.checks.map(label).join(", ");
    lines.push(`${CHECK_MARKER_PREFIX} ${passed}`);
  }
  if (parts.overridden) {
    const missing = DOCUMENT_CHECKS.filter(
      (check) => !parts.checks.includes(check.key),
    )
      .map((check) => check.label)
      .join(", ");
    lines.push(
      missing
        ? `Override: approved without checking ${missing}`
        : "Override: approved with an admin override",
    );
  }
  if (parts.note.trim()) lines.push(parts.note.trim());

  const composed = lines.join("\n");
  return composed || undefined;
}

/** Reads back what composeDecisionNote() wrote. Tolerates a legacy plain note. */
export function parseDecisionNote(decisionNote: string | null): DecisionNoteParts {
  const empty: DecisionNoteParts = { checks: [], overridden: false, note: "" };
  if (!decisionNote) return empty;

  const lines = decisionNote.split("\n");
  const rest: string[] = [];
  const checks: DocumentCheckKey[] = [];
  let overridden = false;

  for (const line of lines) {
    if (line.startsWith(CHECK_MARKER_PREFIX)) {
      const listed = line.slice(CHECK_MARKER_PREFIX.length);
      for (const check of DOCUMENT_CHECKS) {
        if (listed.includes(check.label)) checks.push(check.key);
      }
      continue;
    }
    if (line.startsWith("Override:")) {
      overridden = true;
      continue;
    }
    rest.push(line);
  }

  return { checks, overridden, note: rest.join("\n").trim() };
}
