/**
 * Which rows of reoffer_push_queue (0100) belong to an order or a trip.
 *
 * An order is offered to riders the moment it is placed, and the pushes for
 * those offers wait in the queue for the per-minute scheduler. The placement
 * notify sends them at once instead (offer-push.ts), and this is the filter it
 * claims them with: the order's own rows, the trip's rows, or both. Null when
 * there is nothing to claim, so the caller never runs an unfiltered update.
 */
export function offerQueueFilter(ids: {
  orderId?: string | null;
  deliveryId?: string | null;
}): string | null {
  // PostgREST's or() is comma-separated; an id with a comma or a parenthesis
  // could change the filter, so anything but plain id characters is refused.
  const safe = (id: string | null | undefined) =>
    id && /^[A-Za-z0-9_-]+$/.test(id) ? id : null;
  const parts = [
    safe(ids.orderId) && `order_id.eq.${ids.orderId}`,
    safe(ids.deliveryId) && `delivery_id.eq.${ids.deliveryId}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(",") : null;
}
