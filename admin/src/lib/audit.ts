/**
 * One audit log entry in plain words, for the admin Activity page (0141).
 * Two kinds of entry share the table: account role changes (0028) and rider
 * events (0050). An unknown event is shown by its name rather than hidden.
 */

export interface AuditRow {
  table_name: string | null;
  action: string | null;
  event: string | null;
  rider_id: string | null;
  account_email: string | null;
  old_role: string | null;
  new_role: string | null;
  old_restaurant_id: string | null;
  new_restaurant_id: string | null;
  detail: unknown;
}

const RIDER_EVENTS: Record<string, string> = {
  "rider.suspended": "Suspended rider",
  "rider.unsuspended": "Reinstated rider",
  "rider.status_changed": "Changed status of rider",
  "rider.note_added": "Added a note on rider",
  "rider.access_attached": "Gave app access to rider",
  "rider.access_revoked": "Revoked app access of rider",
  "rider.application_approved": "Approved the application of rider",
  "rider.payouts_paid": "Paid rider",
  "rider.account_closed": "Closed the account of rider",
};

function detailText(event: string, detail: unknown): string {
  if (typeof detail !== "object" || detail === null) return "";
  const d = detail as Record<string, unknown>;
  if (event === "rider.payouts_paid" && typeof d.total === "number") {
    const via =
      d.method === "gcash" ? `GCash ${d.reference ?? ""}`.trim() : "cash";
    return ` ₱${d.total.toFixed(2)} for ${d.count} deliveries by ${via}`;
  }
  return typeof d.reason === "string" && d.reason ? `: ${d.reason}` : "";
}

export function describeAudit(row: AuditRow): string {
  if (row.event) {
    const what = RIDER_EVENTS[row.event] ?? row.event;
    return `${what} ${row.rider_id ?? ""}${detailText(row.event, row.detail)}`.trim();
  }
  const who = row.account_email ?? "an account";
  if (row.action === "insert")
    return `Gave ${who} the ${row.new_role ?? "?"} role`;
  if (row.action === "delete")
    return `Removed ${who} (was ${row.old_role ?? "?"})`;
  const changes: string[] = [];
  if (row.old_role !== row.new_role)
    changes.push(`role ${row.old_role} → ${row.new_role}`);
  if (row.old_restaurant_id !== row.new_restaurant_id) {
    changes.push(
      `restaurant ${row.old_restaurant_id ?? "none"} → ${row.new_restaurant_id ?? "none"}`,
    );
  }
  return `Changed ${who}: ${changes.join(", ") || "no visible change"}`;
}
