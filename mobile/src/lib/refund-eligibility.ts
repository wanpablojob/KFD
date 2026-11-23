import type { CustomerOrder } from "./storefront";

const REFUND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The same rules request_refund enforces (0159), so the button only shows
 * where the server would accept it: delivered, or cancelled after paying,
 * within 7 days, and not already refunded in full.
 */
export function canAskRefund(
  order: Pick<CustomerOrder, "status" | "payment" | "placed_at" | "total">,
  refunded: number,
  now = Date.now()
): boolean {
  const paidAndCancelled = order.status === "cancelled" && order.payment !== "cash";
  return (
    (order.status === "delivered" || paidAndCancelled) &&
    now - new Date(order.placed_at).getTime() <= REFUND_WINDOW_MS &&
    refunded < Number(order.total)
  );
}
