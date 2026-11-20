/**
 * Which order to open the rating form for when a screen sends the customer to
 * their orders with ?rate=<reference>. The reference may be a single order's
 * or a trip's (0092); a trip's first delivered, not-yet-rated shop order wins.
 */
export interface RateCandidate {
  id: string;
  reference: string;
  status: string;
}

export function ratingTargetFor<T extends RateCandidate>(
  entries: { trip: { reference: string } | null; parts: T[] }[],
  ratedIds: ReadonlySet<string>,
  reference: string
): T | null {
  const ref = reference.trim().toUpperCase();
  if (!ref) return null;
  for (const e of entries) {
    const hit =
      e.trip?.reference.toUpperCase() === ref ||
      e.parts.some((p) => p.reference.toUpperCase() === ref);
    if (!hit) continue;
    const open = e.parts.filter((p) => p.status === "delivered" && !ratedIds.has(p.id));
    return open.find((p) => p.reference.toUpperCase() === ref) ?? open[0] ?? null;
  }
  return null;
}
