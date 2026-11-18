/**
 * How many jobs the rider has given up today, and what the next one means
 * (0155). The database enforces the limit; this is what lets the app warn
 * first and take the button away instead of failing after the tap.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";

export interface CancellationStatus {
  used: number;
  limit: number;
}

export const CANCELLATIONS_KEY = ["riderCancellations"] as const;

export async function fetchCancellationStatus(): Promise<CancellationStatus> {
  const { data, error } = await supabase.rpc("rider_cancellation_status");
  if (error) throw error;
  const row = data?.[0];
  return { used: Number(row?.used ?? 0), limit: Number(row?.daily_limit ?? 2) };
}

export function useCancellationStatus() {
  return useQuery({ queryKey: CANCELLATIONS_KEY, queryFn: fetchCancellationStatus });
}

/** False once today's allowance is used. Unknown (still loading) allows: the server decides. */
export function canCancel(status: CancellationStatus | undefined): boolean {
  return !status || status.used < status.limit;
}

/** The warning shown before a cancellation, e.g. "This is cancellation 1 of 2 today." */
export function cancelWarning(status: CancellationStatus | undefined): string | null {
  if (!status) return null;
  const next = status.used + 1;
  if (next > status.limit) return null;
  return next < status.limit
    ? `Warning: this is cancellation ${next} of ${status.limit} allowed today. Cancellations are recorded and reviewed.`
    : `Final warning: this is your last cancellation allowed today (${next} of ${status.limit}). After this, you can't cancel any more jobs today.`;
}

/** Shown in place of the button once the allowance is used. */
export function cancelBlockedNote(status: CancellationStatus | undefined): string {
  const limit = status?.limit ?? 2;
  return `You've cancelled ${limit} jobs today, the most allowed. Contact Meriendash support if you can't finish this one.`;
}
