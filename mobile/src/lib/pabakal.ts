/**
 * Pabakal (0120): a rider buys the customer's list from any store and brings
 * it. Cash only. The customer sets a budget; the rider fronts the money up to
 * it, records the receipt total, and collects receipt + delivery fee + pabakal
 * fee at the door.
 */

import { supabase } from "./supabase";
import type { Database } from "./database.generated";

export type Pabakal = Database["public"]["Tables"]["pabakal_requests"]["Row"];
export type OpenPabakal =
  Database["public"]["Functions"]["rider_open_pabakal"]["Returns"][number];

/** Mirrors pabakal_rules() in 0120; the server enforces it. */
export const PABAKAL_MAX_BUDGET = 2000;

export const PABAKAL_STATUS_LABEL: Record<Pabakal["status"], string> = {
  open: "Looking for a rider",
  accepted: "Rider is buying",
  delivering: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** What the customer pays at the door, or null until the rider has bought. */
export function pabakalAmountDue(
  p: Pick<Pabakal, "item_cost" | "delivery_fee" | "pabakal_fee">
): number | null {
  if (p.item_cost === null) return null;
  return Math.round((p.item_cost + p.delivery_fee + p.pabakal_fee) * 100) / 100;
}

/** A budget as typed: whole or centavo pesos within the cap, or an error. */
export function parseBudget(text: string): { value: number } | { error: string } {
  const value = Number(text.trim());
  if (text.trim() === "" || !Number.isFinite(value) || value <= 0) {
    return { error: "Enter a budget in pesos." };
  }
  if (value > PABAKAL_MAX_BUDGET) {
    return { error: `The most a rider can front is ₱${PABAKAL_MAX_BUDGET}.` };
  }
  return { value: Math.round(value * 100) / 100 };
}

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function fetchMyPabakal(): Promise<Pabakal[]> {
  // RLS returns the caller's own rows: the customer's requests, or the jobs a
  // rider has taken.
  return (
    check(
      await supabase
        .from("pabakal_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30)
    ) ?? []
  );
}

export async function requestPabakal(input: {
  store: string;
  items: string;
  budget: number;
  note: string;
  address: string;
  barangay?: string;
  phone?: string;
}): Promise<void> {
  check(
    await supabase.rpc("customer_request_pabakal", {
      p_store: input.store,
      p_items: input.items,
      p_budget: input.budget,
      p_delivery_address: input.address,
      p_barangay: input.barangay,
      p_contact_phone: input.phone,
      p_note: input.note.trim() || undefined,
    })
  );
}

export async function cancelPabakal(id: string): Promise<void> {
  check(await supabase.rpc("customer_cancel_pabakal", { p_id: id }));
}

export async function fetchOpenPabakal(): Promise<OpenPabakal[]> {
  return check(await supabase.rpc("rider_open_pabakal")) ?? [];
}

export async function claimPabakal(id: string): Promise<void> {
  check(await supabase.rpc("rider_claim_pabakal", { p_id: id }));
}

export async function markPabakalBought(id: string, itemCost: number): Promise<void> {
  check(
    await supabase.rpc("rider_pabakal_bought", { p_id: id, p_item_cost: itemCost })
  );
}

export async function markPabakalDelivered(id: string, cash: number): Promise<void> {
  check(
    await supabase.rpc("rider_pabakal_delivered", { p_id: id, p_cash_collected: cash })
  );
}
