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
 *
 * The same screen also gated its rider-profile check on `profile === null`,
 * which treats a still-loading profile as a present one. Both defects were the
 * same mistake -- reading "not known yet" as a definite answer -- and they
 * produced opposite symptoms: the list vanished on remount while a null-check
 * let a loading profile through. riderProfileGate in rider-profile-gate.ts is
 * the three-way version of the same decision.
 */
export function shouldSyncPage1(
  incoming: DeliveryPage | undefined,
  lastSynced: DeliveryPage | undefined
): boolean {
  return incoming !== undefined && incoming !== lastSynced;
}

/**
 * Append a later page to the list already on screen, without duplicating an
 * order.
 *
 * The cursor is a window over orders ordered by placement time, and an order can
 * change status between the page-1 fetch and a later page fetch. When that
 * happens the same order appears in both, and `[...prev, ...rows]` produces two
 * FlatList rows with the same `id` -- React warns, and worse, the rider sees the
 * same job twice and one of the two copies is stale.
 *
 * First wins: the copy already on screen is kept and the later duplicate is
 * dropped. The alternative (last wins) would move a row to the end of the list
 * mid-scroll, which is a worse surprise than a status that is one refresh old --
 * and a page-1 refetch, which is the authoritative refresh, replaces the list
 * wholesale via shouldSyncPage1.
 */
export function mergeOrderPages<T extends { id: string }>(
  existing: readonly T[],
  incoming: readonly T[]
): T[] {
  const seen = new Set(existing.map((row) => row.id));
  const merged = [...existing];
  for (const row of incoming) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}
