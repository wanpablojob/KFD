import type { RiderOrderPageResult } from "./storefront";

export type DeliveryPage = RiderOrderPageResult;

export interface DeliveryList {
  items: DeliveryPage["items"];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Decide whether a new page-1 result should replace the list on screen.
 *
 * This is a pure function because the bug it fixes was invisible in review and
 * only appeared on a device: the rider tab layout is a Stack, which unmounts an
 * inactive screen. Coming back from another tab remounts the screen, the query
 * goes pending, and `data` is undefined for a moment. The screen used to sync
 * on any change of `page1`'s identity, so that undefined was read as "the
 * server returned nothing" and the list was emptied. Riders watched their
 * deliveries vanish on tab change and had to pull-to-refresh to get them back.
 *
 * The rule is one line: only a defined page may replace the list. Undefined
 * means "we do not know yet" (first load, an in-flight refetch, or a remount
 * still resolving), and unknown is not the same as empty. Reporting zero
 * deliveries when the truth is merely unknown is what made the bug read as
 * data loss.
 *
 * React Query's `placeholderData: (prev) => prev` covers a background refetch
 * while mounted, but not a remount: there is no previous observer to inherit
 * from, so the guard has to live here.
 */
export function shouldSyncPage1(
  incoming: DeliveryPage | undefined,
  lastSynced: DeliveryPage | undefined
): boolean {
  return incoming !== undefined && incoming !== lastSynced;
}
