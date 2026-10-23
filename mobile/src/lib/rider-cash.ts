/**
 * The rider's cash position (0079).
 *
 * Deliberately separate from the earnings figures on the same screen, because
 * they are different money moving in different directions and conflating them
 * produces a confident lie:
 *
 *   earnings  what the PLATFORM owes the rider for the work
 *   on hand   what the CUSTOMER handed the rider in cash, not yet paid back
 *
 * A rider can have a healthy balance and be carrying ₱4,000 that the platform
 * has not seen. That is the number that decides whether they need to bank today,
 * so it gets its own place on the screen rather than a line inside earnings.
 */

import { supabase } from "./supabase";

export interface RiderCashPosition {
  collected: number;
  handed_over: number;
  on_hand: number;
  flagged: number;
  deliveries: number;
}

/**
 * Collected minus handed over, plus the variance an operator would need.
 *
 * gen-types cannot infer nullability for a RETURNS TABLE and marks every column
 * non-null, so these are cast explicitly here rather than being trusted as
 * guaranteed. A rider with no cash deliveries at all is a real and common state,
 * and it must read as zero rather than crash the screen.
 */
export async function fetchRiderCashPosition(): Promise<RiderCashPosition> {
  const { data, error } = await supabase.rpc("rider_cash_position");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    collected: num(row?.collected),
    handed_over: num(row?.handed_over),
    on_hand: num(row?.on_hand),
    flagged: num(row?.flagged),
    deliveries: typeof row?.deliveries === "number" ? row.deliveries : 0,
  };
}

/** Signed the way a rider reads it: short is negative, over is positive. */
export function cashOnHandLabel(onHand: number): {
  text: string;
  tone: "clear" | "warning";
} {
  const rounded = Math.round(onHand * 100) / 100;
  if (Math.abs(rounded) < 0.005) return { text: "₱0.00", tone: "clear" };
  return {
    text: rounded < 0 ? `-₱${Math.abs(rounded).toFixed(2)}` : `₱${rounded.toFixed(2)}`,
    tone: rounded > 0.005 ? "warning" : "clear",
  };
}

/** What KFD still owes the rider, what is in review, and the last payment (0134). */
export interface RiderPayoutPosition {
  owed: number;
  inReview: number;
  paid: number;
  lastPaidAt: string | null;
}

export async function fetchRiderPayoutPosition(): Promise<RiderPayoutPosition> {
  const { data, error } = await supabase.rpc("rider_payout_position");
  if (error) throw error;
  const row = data?.[0];
  return {
    owed: Number(row?.owed ?? 0),
    inReview: Number(row?.in_review ?? 0),
    paid: Number(row?.paid ?? 0),
    lastPaidAt: row?.last_paid_at ?? null,
  };
}

/** "To be paid ₱75.00 · ₱50.00 in review · Last paid 20 Oct", or null when there is nothing yet. */
export function payoutLine(
  p: RiderPayoutPosition,
  peso: (n: number) => string
): string | null {
  if (p.owed <= 0 && p.inReview <= 0 && p.paid <= 0) return null;
  const parts = [`To be paid ${peso(p.owed)}`];
  if (p.inReview > 0) parts.push(`${peso(p.inReview)} in review`);
  if (p.lastPaidAt) {
    parts.push(
      `Last paid ${new Date(p.lastPaidAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
    );
  }
  return parts.join(" · ");
}
