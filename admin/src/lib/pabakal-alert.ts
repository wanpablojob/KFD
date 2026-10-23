/**
 * Telling riders a pabakal is waiting (R3).
 *
 * The customer app announces its own request right after placing it. The
 * route reads the request with the service role, so this rule is the only
 * thing stopping a signed-in user from making every rider's phone ring for a
 * request that is not theirs, or one already taken.
 */

export interface PabakalForAlert {
  customer_user_id: string | null;
  status: string;
  store: string;
  stops: unknown;
}

export function mayAnnouncePabakal(
  callerId: string,
  row: PabakalForAlert,
): boolean {
  return (
    !!row.customer_user_id &&
    row.customer_user_id === callerId &&
    row.status === "open"
  );
}

/** "Mercury Drug", or "Mercury Drug + 2 more" for several stores. */
export function pabakalAlertBody(row: PabakalForAlert): string {
  const stores = Array.isArray(row.stops)
    ? row.stops
        .map((s) =>
          s && typeof s === "object" ? (s as { store?: unknown }).store : null,
        )
        .filter((s): s is string => typeof s === "string" && s.trim() !== "")
    : [];
  const first = stores[0] ?? row.store.split(",")[0]?.trim() ?? "a store";
  const more = stores.length > 1 ? ` + ${stores.length - 1} more` : "";
  return `Buy from ${first}${more}. Open Available to take it.`;
}

/** The customer's notice for where their pabakal is now (P2). */
export interface PabakalStatusRow {
  reference: string;
  status: string;
  item_cost: number | null;
  delivery_fee: number;
  pabakal_fee: number;
  cancel_reason: string | null;
}

export function pabakalStatusNotice(
  row: PabakalStatusRow,
): { title: string; body: string } | null {
  const peso = (n: number) => `₱${n.toFixed(2)}`;
  switch (row.status) {
    case "accepted":
      return {
        title: "A rider took your pabakal",
        body: `${row.reference}: they are buying it now.`,
      };
    case "delivering": {
      const cost = Number(row.item_cost ?? 0);
      const due = cost + Number(row.delivery_fee) + Number(row.pabakal_fee);
      return {
        title: "Your pabakal is on the way",
        body: `Receipt ${peso(cost)}. Pay ${peso(due)} in cash when it arrives.`,
      };
    }
    case "delivered":
      return {
        title: "Pabakal delivered",
        body: `${row.reference} is done. Salamat!`,
      };
    case "cancelled":
      return {
        title: "Pabakal cancelled",
        body: row.cancel_reason
          ? `${row.reference}: ${row.cancel_reason}`
          : `${row.reference} was cancelled.`,
      };
    default:
      return null;
  }
}

/** A status notice is the assigned rider's or an admin's to send. */
export function mayAnnouncePabakalStatus(
  caller: { userId: string; role: string | null },
  assignedRiderUserId: string | null,
): boolean {
  return (
    caller.role === "admin" ||
    (!!assignedRiderUserId && assignedRiderUserId === caller.userId)
  );
}
