/**
 * Pabakal (0120, 0130): a rider buys the customer's list from one or more
 * stores and brings it. Cash only. The customer lists items and quantities per
 * store; the rider fronts the money, records the receipt total, and collects
 * receipt + delivery fee + pabakal fee at the door.
 */

import { supabase } from "./supabase";
import type { Database, Json } from "./database.generated";

export type Pabakal = Database["public"]["Tables"]["pabakal_requests"]["Row"];
export type OpenPabakal =
  Database["public"]["Functions"]["rider_open_pabakal"]["Returns"][number];

/** Mirrors pabakal_rules() in 0130; the server enforces it. */
export const PABAKAL_RULES = {
  fee: 20,
  perExtraStore: 10,
  maxCost: 2000,
  maxStores: 5,
} as const;

export interface PabakalStop {
  store: string;
  items: { name: string; quantity: number }[];
}

/** The pabakal fee for this many stores, as the server will charge it. */
export function pabakalFee(stores: number): number {
  return PABAKAL_RULES.fee + PABAKAL_RULES.perExtraStore * Math.max(stores - 1, 0);
}

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

/** The form as typed: stores with item rows, quantities as text. */
export interface StopDraft {
  store: string;
  items: { name: string; quantity: string }[];
}

/**
 * The stops to send, or the first thing to fix. Blank item rows are dropped,
 * so the empty row the form keeps at the end never has to be deleted.
 */
export function cleanStops(
  drafts: StopDraft[]
): { stops: PabakalStop[] } | { error: string } {
  const stops: PabakalStop[] = [];
  for (const draft of drafts) {
    const store = draft.store.trim();
    const items = draft.items.filter((i) => i.name.trim() || i.quantity.trim());
    if (!store && items.length === 0) continue;
    if (store.length < 2) return { error: "Name each store." };
    if (items.length === 0) return { error: `Add what to buy at ${store}.` };
    const lines: PabakalStop["items"] = [];
    for (const item of items) {
      const name = item.name.trim();
      const quantity = Number(item.quantity.trim());
      if (!name) return { error: `Name each item at ${store}.` };
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return { error: `Give a quantity from 1 to 99 for ${name}.` };
      }
      lines.push({ name, quantity });
    }
    stops.push({ store, items: lines });
  }
  if (stops.length === 0) return { error: "Add a store and what to buy there." };
  if (stops.length > PABAKAL_RULES.maxStores) {
    return { error: `A pabakal can visit up to ${PABAKAL_RULES.maxStores} stores.` };
  }
  return { stops };
}

/**
 * A row's stops. A 0120 row has none: its free-text list comes back as one
 * line with quantity 0, which formatLine shows without a count.
 */
export function stopsOf(p: Pick<Pabakal, "stops" | "store" | "items">): PabakalStop[] {
  return Array.isArray(p.stops) && p.stops.length > 0
    ? (p.stops as unknown as PabakalStop[])
    : [{ store: p.store, items: [{ name: p.items, quantity: 0 }] }];
}

export function formatLine(item: { name: string; quantity: number }): string {
  return item.quantity > 0 ? `${item.quantity}× ${item.name}` : item.name;
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
  stops: PabakalStop[];
  note: string;
  address: string;
  barangay?: string;
  phone?: string;
}): Promise<void> {
  check(
    await supabase.rpc("customer_request_pabakal", {
      p_stops: input.stops as unknown as Json,
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
