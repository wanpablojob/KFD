/**
 * Rider cancellations grouped per rider, for the Riders page (0155). The
 * database records each one and enforces the daily limit; this ranks riders so
 * the ones cancelling most are at the top.
 */

export interface CancellationEntry {
  riderId: string;
  riderName: string;
  kind: "order" | "trip" | "pabakal";
  reference: string | null;
  reason: string | null;
  createdAt: string;
}

export interface RiderCancellationSummary {
  riderId: string;
  riderName: string;
  today: number;
  /** Everything in the fetched window (7 days). */
  week: number;
  atLimit: boolean;
  /** Newest first. */
  entries: CancellationEntry[];
}

/** The daily allowance (rider_daily_cancel_limit, 0155). */
export const DAILY_CANCEL_LIMIT = 2;

export const CANCELLATION_KIND_LABEL: Record<
  CancellationEntry["kind"],
  string
> = {
  order: "Order",
  trip: "Trip",
  pabakal: "Pabakal",
};

/**
 * "Today" is the admin's local calendar day, which is the Philippines for this
 * team -- the same day the database counts against the rider.
 */
export function summarizeCancellations(
  entries: readonly CancellationEntry[],
  now: Date,
): RiderCancellationSummary[] {
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const byRider = new Map<string, RiderCancellationSummary>();
  for (const entry of entries) {
    let row = byRider.get(entry.riderId);
    if (!row) {
      row = {
        riderId: entry.riderId,
        riderName: entry.riderName,
        today: 0,
        week: 0,
        atLimit: false,
        entries: [],
      };
      byRider.set(entry.riderId, row);
    }
    row.week += 1;
    if (new Date(entry.createdAt).getTime() >= startOfToday) row.today += 1;
    row.entries.push(entry);
  }
  return [...byRider.values()]
    .map((row) => ({
      ...row,
      atLimit: row.today >= DAILY_CANCEL_LIMIT,
      entries: [...row.entries].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    }))
    .sort(
      (a, b) =>
        b.today - a.today ||
        b.week - a.week ||
        a.riderName.localeCompare(b.riderName),
    );
}
