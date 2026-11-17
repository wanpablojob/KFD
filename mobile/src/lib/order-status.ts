/**
 * "Ready for pickup" (0146) is not an order status: the order stays
 * `preparing` on the server, so every rule that lists running statuses keeps
 * working, and the shop marks it ready with a timestamp. Every screen that
 * shows a status asks here, so they cannot disagree about what "ready" is.
 */
export const READY_LABEL = "Ready for pickup";

export function isReadyForPickup(
  status: string,
  readyForPickupAt: string | null | undefined
): boolean {
  return status === "preparing" && !!readyForPickupAt;
}

/** The label for a status, with "Ready for pickup" in place of preparing when it is. */
export function statusLabel(
  labels: Record<string, string>,
  status: string,
  readyForPickupAt: string | null | undefined
): string {
  if (isReadyForPickup(status, readyForPickupAt)) return READY_LABEL;
  return labels[status] ?? status;
}
