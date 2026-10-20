/**
 * What on the admin overview needs a person right now.
 *
 * The overview's numbers describe how the week went; this answers "what do I
 * do next". Each item is a count with a link to the screen where it is
 * resolved, and an item with nothing in it is left out, so an empty list
 * means genuinely nothing to do.
 */

export interface AttentionOrder {
  status: string;
  placedAt: string;
  rider: string;
  deliveryFailedAt: string | null;
  /**
   * The trip this order is part of (0092), when it is one shop of a basket.
   * A part of a trip is never dispatched on its own, so it is not counted as
   * an order waiting for a rider.
   */
  deliveryId?: string | null;
}

export interface AttentionItem {
  key: string;
  label: string;
  count: number;
  href: string;
  /** Urgent items are customers or riders waiting now; the rest are a queue. */
  urgent: boolean;
}

/** A restaurant that has not answered in this long has probably not seen it. */
export const UNANSWERED_MINUTES = 10;

const OPEN = ["pending", "confirmed", "preparing", "out_for_delivery"];

export function attentionItems(
  input: {
    orders: AttentionOrder[];
    disputedPayouts: number;
    pendingApplications: number;
    deletionRequests: number;
  },
  now: Date,
): AttentionItem[] {
  const cutoff = now.getTime() - UNANSWERED_MINUTES * 60_000;
  const unanswered = input.orders.filter(
    (o) => o.status === "pending" && new Date(o.placedAt).getTime() <= cutoff,
  ).length;
  // Accepted by the kitchen but nobody to carry it. A failed delivery also
  // comes back with no rider; it is counted once, under "failed" below.
  const noRider = input.orders.filter(
    (o) =>
      (o.status === "confirmed" || o.status === "preparing") &&
      !o.rider &&
      o.deliveryFailedAt === null &&
      // A shop's part of a trip is never dispatched on its own (0092): the
      // trip is the unit, so counting the parts would count one delivery
      // three times.
      !o.deliveryId,
  ).length;
  // A rider gave up on it and it is still open, so it needs reassigning.
  const failed = input.orders.filter(
    (o) => o.deliveryFailedAt !== null && OPEN.includes(o.status),
  ).length;

  const items: AttentionItem[] = [
    {
      key: "unanswered",
      label: `Not accepted after ${UNANSWERED_MINUTES} min`,
      count: unanswered,
      href: "/dashboard/orders",
      urgent: true,
    },
    { key: "no-rider", label: "Waiting for a rider", count: noRider, href: "#waiting-for-rider", urgent: true },
    { key: "failed", label: "Failed delivery, needs a new rider", count: failed, href: "#waiting-for-rider", urgent: true },
    { key: "disputes", label: "Disputed rider payouts", count: input.disputedPayouts, href: "/dashboard/riders", urgent: false },
    { key: "applications", label: "Rider applications to review", count: input.pendingApplications, href: "/dashboard/riders", urgent: false },
    { key: "deletions", label: "Rider account deletion requests", count: input.deletionRequests, href: "/dashboard/riders", urgent: false },
  ];
  return items.filter((item) => item.count > 0);
}

/**
 * Restaurants ranked by what their delivered orders brought in over the last
 * `days` days. Windowed like the KPIs above it; the old card ranked by
 * lifetime revenue, so a restaurant that stopped trading months ago could
 * still lead "who to watch". `value` decides what an order is worth (the
 * dashboard passes net-of-refunds revenue).
 */
export function topRestaurants<T extends { status: string; placedAt: string; restaurant: string }>(
  orders: T[],
  now: Date,
  days: number,
  value: (order: T) => number,
  limit = 5,
): { name: string; orders: number; revenue: number }[] {
  const since = now.getTime() - days * 24 * 60 * 60 * 1000;
  const byName = new Map<string, { name: string; orders: number; revenue: number }>();
  for (const order of orders) {
    const at = new Date(order.placedAt).getTime();
    if (order.status !== "delivered" || at < since || at > now.getTime()) continue;
    const row = byName.get(order.restaurant) ?? { name: order.restaurant, orders: 0, revenue: 0 };
    row.orders += 1;
    row.revenue = Math.round((row.revenue + value(order)) * 100) / 100;
    byName.set(order.restaurant, row);
  }
  return [...byName.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

/** Open orders by stage, for the "right now" strip. */
export function liveCounts(orders: { status: string }[]) {
  const count = (status: string) => orders.filter((o) => o.status === status).length;
  return {
    pending: count("pending"),
    kitchen: count("confirmed") + count("preparing"),
    onTheRoad: count("out_for_delivery"),
  };
}
