import { supabase } from "./client";
import type { Tables } from "./database.types";

/**
 * Stalled orders, as the database recorded them (0149).
 *
 * The sweep is the source of truth: nothing here decides what is stalled, so
 * the overview, the list and the rider's record cannot disagree about whether
 * an order was left sitting. Reads only -- the table has no write grant.
 */

/** One open stall, with the order it belongs to. */
export interface StallRow {
  orderId: string;
  riderId: string | null;
  deliveryId: string | null;
  stage: string;
  /** The last moment the order is known to have moved. */
  stallSince: string;
  /** Minutes at the moment the sweep last looked; `stallSince` is fresher. */
  minutesStalled: number;
}

/** A rider's stall record. */
export interface RiderStallCount {
  /** Distinct jobs that stalled, ever. A basket trip counts once. */
  total: number;
  /** Jobs stalled right now. */
  open: number;
  lastAt: string | null;
}

type StallTable = Tables<"order_stalls">;

function toStall(row: StallTable): StallRow {
  return {
    orderId: String(row.order_id),
    riderId: (row.rider_id as string | null) ?? null,
    deliveryId: (row.delivery_id as string | null) ?? null,
    stage: String(row.stage),
    stallSince: String(row.stall_since),
    minutesStalled: Number(row.minutes_stalled ?? 0),
  };
}

/**
 * Orders stalled right now, newest detection first.
 *
 * Best-effort on purpose, like the other queue counts on the overview: on a
 * deployment where 0149 has not been applied the table is absent, and the
 * overview should lose this one item rather than the whole page.
 */
export async function fetchOpenStalls(): Promise<StallRow[]> {
  const { data, error } = await supabase
    .from("order_stalls")
    .select("order_id, delivery_id, rider_id, stage, stall_since, minutes_stalled, detected_at")
    .is("cleared_at", null)
    .order("detected_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toStall(row as StallTable));
}

/**
 * One rider's stall record, for their page.
 *
 * Same dedupe as the fleet-wide version below, but filtered to the rider so a
 * single-rider page does not download everybody's history to count one column.
 */
export async function fetchStallCountForRider(
  riderId: string,
): Promise<{ total: number; open: number }> {
  const { data, error } = await supabase
    .from("order_stalls")
    .select("order_id, delivery_id, cleared_at")
    .eq("rider_id", riderId)
    .limit(5000);
  if (error) throw new Error(error.message);

  const jobs = new Map<string, boolean>();
  for (const row of data ?? []) {
    const job = (row.delivery_id as string | null) ?? String(row.order_id);
    jobs.set(job, (jobs.get(job) ?? false) || row.cleared_at === null);
  }
  let open = 0;
  for (const stillOpen of jobs.values()) if (stillOpen) open += 1;
  return { total: jobs.size, open };
}

/**
 * Every rider's stall record, keyed by rider id.
 *
 * One pass over the history rather than an aggregate RPC: the table is one row
 * per stalled order, so even a bad year is small. A trip's shops share one
 * `delivery_id` and are counted once -- one dead phone is one incident, not
 * three because the basket had three shops.
 */
export async function fetchStallCountsByRider(): Promise<Map<string, RiderStallCount>> {
  const { data, error } = await supabase
    .from("order_stalls")
    .select("order_id, delivery_id, rider_id, detected_at, cleared_at")
    .not("rider_id", "is", null)
    .order("detected_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);

  // rider -> job key -> still open?
  const byRider = new Map<string, Map<string, { open: boolean; at: string }>>();
  for (const row of data ?? []) {
    const riderId = row.rider_id as string | null;
    if (!riderId) continue;
    const job = (row.delivery_id as string | null) ?? String(row.order_id);
    const at = String(row.detected_at);
    const jobs = byRider.get(riderId) ?? new Map<string, { open: boolean; at: string }>();
    const seen = jobs.get(job);
    jobs.set(job, {
      open: (seen?.open ?? false) || row.cleared_at === null,
      at: seen && seen.at > at ? seen.at : at,
    });
    byRider.set(riderId, jobs);
  }

  const counts = new Map<string, RiderStallCount>();
  for (const [riderId, jobs] of byRider) {
    let open = 0;
    let lastAt: string | null = null;
    for (const job of jobs.values()) {
      if (job.open) open += 1;
      if (!lastAt || job.at > lastAt) lastAt = job.at;
    }
    counts.set(riderId, { total: jobs.size, open, lastAt });
  }
  return counts;
}
