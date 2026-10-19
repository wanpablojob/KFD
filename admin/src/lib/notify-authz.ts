/**
 * Who may ask for an order notification.
 *
 * The route reads the order with the service role, which bypasses RLS, so the
 * caller's identity is the only access control on that path. Keeping the rule
 * here means it can be tested without a running server -- and the two cases
 * that matter are worth pinning:
 *
 *   - a merchant must not be able to announce a "new order" for their own
 *     restaurant, because that would let them fabricate mail to their own
 *     customers;
 *   - a customer must not be able to announce, or request status mail for,
 *     an order that belongs to somebody else.
 */

export type NotifyEvent = "placed" | "status_changed";

export interface CallerScope {
  /** Verified auth.users id of the caller (never a body field). */
  userId: string;
  /** app_users.role for that user, or null when there is no row. */
  role: string | null;
  /** app_users.restaurant_id for that user, or null. */
  restaurantId: string | null;
}

export interface OrderScope {
  restaurantId: string | null;
  customerUserId: string | null;
}

export function mayNotifyOrder(
  event: NotifyEvent,
  caller: CallerScope,
  order: OrderScope
): boolean {
  if (caller.role === "admin") return true;

  if (event === "placed") {
    // The customer app announces the order it just placed. Ownership is the
    // check: the id comes from the verified token, not from the request body.
    return !!order.customerUserId && order.customerUserId === caller.userId;
  }

  // status_changed belongs to the merchant who cooks the order. Admins were
  // handled above; customers and everyone else have no business here.
  return (
    caller.role === "merchant" &&
    !!order.restaurantId &&
    order.restaurantId === caller.restaurantId
  );
}
