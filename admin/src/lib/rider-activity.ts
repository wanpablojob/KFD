/**
 * Human-readable labels for the rider activity timeline.
 *
 * The events come from security-definer functions in migrations 0050 and 0051,
 * so their names are part of the database contract and a UI typo cannot be fixed
 * by renaming a constant here. `describeEvent` is therefore total: an unknown
 * name is rendered rather than dropped, because a timeline that silently omits
 * the one event an admin did not recognise is worse than one showing a raw key.
 */

import type { RiderActivityEvent } from "@/lib/types";

export interface DescribedEvent {
  /** Short headline, e.g. "Suspended". */
  label: string;
  /** The reason, note or before/after values. Null when the event carries none. */
  detail: string | null;
  /** Suspended, revoked and approvals are the ones an admin acts on. */
  tone: "normal" | "warning";
}

function text(detail: Record<string, unknown> | null, key: string): string | null {
  const value = detail?.[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function describeEvent(event: RiderActivityEvent): DescribedEvent {
  const detail = event.detail;

  switch (event.event) {
    case "rider.status_changed": {
      const from = text(detail, "from");
      const to = text(detail, "to");
      return {
        label: `Status changed${to ? ` to ${to}` : ""}`,
        detail: from ? `${from} → ${to ?? "?"}` : null,
        tone: "normal",
      };
    }
    case "rider.suspended":
      return {
        label: "Suspended",
        detail: text(detail, "reason"),
        tone: "warning",
      };
    case "rider.unsuspended":
      return { label: "Reinstated", detail: null, tone: "normal" };
    case "rider.access_attached":
      return { label: "Account attached", detail: null, tone: "normal" };
    case "rider.access_revoked":
      return {
        label: "Account access revoked",
        detail: null,
        tone: "warning",
      };
    case "rider.note_added":
      return {
        label: "Note added",
        // The body is in rider_notes, not the audit detail. The detail only
        // carries the id, so repeating it here would be noise.
        detail: null,
        tone: "normal",
      };
    case "rider.application_approved":
      return {
        label: "Application approved",
        detail: text(detail, "note"),
        tone: "normal",
      };
    default:
      return {
        label: event.event.replace(/[._]/g, " "),
        detail: null,
        tone: "normal",
      };
  }
}

/**
 * Newest first, ties broken by id.
 *
 * The RPC already orders by `changed_at desc, id desc`, but a second timestamp
 * can arrive within the same millisecond and Postgres will hand back two rows in
 * an arbitrary order. Sorting the handful of rows again is cheaper than
 * explaining an out-of-order timeline.
 */
export function sortActivity(events: RiderActivityEvent[]): RiderActivityEvent[] {
  return [...events].sort((a, b) => {
    const delta = Date.parse(b.changedAt) - Date.parse(a.changedAt);
    if (delta !== 0 && Number.isFinite(delta)) return delta;
    return b.id - a.id;
  });
}