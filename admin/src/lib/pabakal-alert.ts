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
