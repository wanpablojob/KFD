import type { OrderEmailData, OrderEmailItem } from "./server/order-email";

/**
 * The email body data for a notify call.
 *
 * A notify call is about either one order (`orderId`) or a whole trip
 * (`deliveryId`). The trip branch has no order row, and reading `order.x`
 * unconditionally threw `Cannot read properties of null (reading 'restaurant')`
 * for every basket checkout, so no merchant mail, merchant push, customer
 * receipt, or rider offer push ever went out. Keep this pure and null-safe:
 * the trip-only shape is the common case, not an edge case.
 */
export interface NotifyOrderView {
  reference: string;
  restaurant: string;
  customer: string;
  items: unknown;
  total: number | string | null;
}

export interface NotifyTripView {
  reference: string;
  customer: string;
  total: number | string | null;
}

export function orderEmailData(
  order: NotifyOrderView | null,
  trip: NotifyTripView | null
): OrderEmailData {
  return {
    reference: order?.reference ?? trip?.reference ?? "",
    restaurant: order?.restaurant ?? "",
    customer: order?.customer ?? trip?.customer ?? "",
    items: Array.isArray(order?.items) ? (order.items as OrderEmailItem[]) : [],
    total: Number(order?.total ?? trip?.total ?? 0),
  };
}
