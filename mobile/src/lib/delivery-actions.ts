/**
 * Which delivery actions a rider may take on an order, by status.
 *
 * This exists because the rider card used to decide with
 * `!["delivered","cancelled"].includes(status)`, which is "not finished" rather
 * than "can act on". Those differ: `pending` is unfinished, so the card showed
 * "Mark delivered" for it -- and rider_mark_delivered refuses `pending`, so the
 * rider tapped a button that could only ever return
 * "cannot be marked delivered from its current state (pending)".
 *
 * A rider could reach that dead end through the normal flow, because
 * claim_order accepted `pending` orders while dispatch offered them. Migration
 * 0071 closes both ends, and this module is the client half of that contract:
 * the three lists below are copies of the server's guards, so the app cannot
 * offer an action the database will refuse.
 *
 * If one of these lists changes, the migration that changed the server guard
 * must change it here too. They are tested against the same states the server
 * names, which is the point: a drift shows up as a failing test rather than as a
 * rider hitting an error.
 */
export interface DeliveryActions {
  /** Confirm the food has been collected: rider_mark_picked_up. */
  canPickUp: boolean;
  /** Complete the delivery: rider_mark_delivered. */
  canDeliver: boolean;
  /** Return it to the pool with a reason: rider_report_failed_delivery. */
  canReportFailed: boolean;
}

/** rider_mark_picked_up accepts exactly these (0071). */
const PICKUP_STATUSES: readonly string[] = ["confirmed", "preparing"];

/**
 * rider_mark_delivered and rider_report_failed_delivery accept exactly these
 * (0038, extended by 0071). Identical on purpose: a rider who cannot complete a
 * delivery must be able to return it.
 */
const RUNNING_STATUSES: readonly string[] = [
  "confirmed",
  "preparing",
  "out_for_delivery",
];

/**
 * Nothing further will happen, so every action disappears. This is the same
 * terminal check the tracker uses, kept as one shared definition so the rider
 * card and the customer's progression cannot disagree about what "finished" is.
 */
const TERMINAL_STATUSES: readonly string[] = ["delivered", "cancelled"];

export function deliveryActions(status: string): DeliveryActions {
  if (TERMINAL_STATUSES.includes(status)) {
    return { canPickUp: false, canDeliver: false, canReportFailed: false };
  }
  return {
    canPickUp: PICKUP_STATUSES.includes(status),
    canDeliver: RUNNING_STATUSES.includes(status),
    canReportFailed: RUNNING_STATUSES.includes(status),
  };
}
