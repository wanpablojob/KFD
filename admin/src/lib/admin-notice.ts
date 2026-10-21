/**
 * What a person is told after an admin decision about them (0111 follow-up):
 * a rider application reviewed, a refund recorded, a rider suspended or
 * reinstated. Built from the row as saved, never from text the caller sends,
 * so the route cannot be used to message anyone anything.
 */

export type AdminNoticeKind = "application" | "refund" | "suspension";

export interface Notice {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export function applicationNotice(row: {
  status: string;
  decision_note: string | null;
}): Notice | null {
  const note = row.decision_note?.trim() ? ` Note: ${row.decision_note.trim()}` : "";
  if (row.status === "approved") {
    return {
      title: "You're a KFD rider",
      body: "Your application was approved. Open the KFD app to start riding.",
      data: {},
    };
  }
  if (row.status === "rejected") {
    return {
      title: "Rider application update",
      body: `Your rider application was not approved.${note}`,
      data: {},
    };
  }
  return null;
}

export function refundNotice(row: {
  amount: number;
  method: string;
  reference: string;
}): Notice {
  const via = row.method === "gcash" ? "GCash" : "cash";
  return {
    title: "Refund recorded",
    body: `₱${row.amount.toFixed(2)} for order ${row.reference} is being refunded by ${via}.`,
    data: { reference: row.reference },
  };
}

export function suspensionNotice(row: {
  suspended_at: string | null;
  suspended_reason: string | null;
}): Notice {
  if (row.suspended_at) {
    const reason = row.suspended_reason?.trim() ? ` Reason: ${row.suspended_reason.trim()}` : "";
    return {
      title: "Rider account paused",
      body: `You won't get delivery offers for now. Contact KFD support.${reason}`,
      data: {},
    };
  }
  return {
    title: "You're back on",
    body: "Your rider account is active again. Go online to get offers.",
    data: {},
  };
}
