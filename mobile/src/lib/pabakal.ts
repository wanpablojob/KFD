/**
 * Pabakal (0120, 0130): a rider buys the customer's list from one or more
 * stores and brings it. Cash only. The customer lists items and quantities per
 * store; the rider fronts the money, records the receipt total, and collects
 * the receipt total plus the fees at the door.
 */

import { supabase } from "./supabase";
import { postApi } from "./admin-api";
import { uploadLocalImage } from "./image-upload";
import { PROOF_BUCKET } from "./delivery-proof";
import type { Database, Json } from "./database.generated";

export type Pabakal = Database["public"]["Tables"]["pabakal_requests"]["Row"];
export type OpenPabakal =
  Database["public"]["Functions"]["rider_open_pabakal"]["Returns"][number];

/** Mirrors pabakal_rules() in 0131; the server enforces it. */
export const PABAKAL_RULES = {
  fee: 0,
  perExtraStore: 10,
  maxCost: 2000,
  maxStores: 5,
} as const;

export interface PabakalStop {
  store: string;
  items: { name: string; quantity: number }[];
}

/** What a pabakal adds to the delivery fee: 10 per extra store, like a food trip. */
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
  const placed = check(
    await supabase.rpc("customer_request_pabakal", {
      p_stops: input.stops as unknown as Json,
      p_delivery_address: input.address,
      p_barangay: input.barangay,
      p_contact_phone: input.phone,
      p_note: input.note.trim() || undefined,
    })
  );
  // Ring the online riders' phones. Best-effort: the request is already on
  // every rider's Available tab either way.
  const id = placed?.[0]?.id;
  if (id) void postApi("/api/pabakal/notify", { id });
}

/** The rider hands a pabakal back before buying (0133); it reopens for others. */
export async function releasePabakal(id: string): Promise<void> {
  check(await supabase.rpc("rider_release_pabakal", { p_id: id }));
}

export async function cancelPabakal(id: string): Promise<void> {
  check(await supabase.rpc("customer_cancel_pabakal", { p_id: id }));
}

export async function fetchOpenPabakal(): Promise<OpenPabakal[]> {
  return check(await supabase.rpc("rider_open_pabakal")) ?? [];
}

export async function claimPabakal(id: string): Promise<void> {
  check(await supabase.rpc("rider_claim_pabakal", { p_id: id }));
  // The customer hears each step (P2). Best-effort, never blocks.
  void postApi("/api/pabakal/notify", { id });
}

/** Where a pabakal's receipt photo goes: the rider's own folder (0140). */
export function receiptPath(riderId: string, id: string, uri: string): string {
  const lower = uri.toLowerCase();
  const ext = lower.endsWith(".png") ? "png" : lower.endsWith(".webp") ? "webp" : "jpg";
  return `${riderId}/pbk-${id}-receipt.${ext}`;
}

/**
 * Upload the receipt photo, then record the total (0140). Upload first: the
 * server refuses "bought" without the photo in the bucket. A photo an earlier
 * attempt already uploaded is reused, so a retry at the counter goes through.
 */
export async function markPabakalBought(
  id: string,
  itemCost: number,
  riderId: string,
  photoUri: string
): Promise<void> {
  const path = receiptPath(riderId, id, photoUri);
  const ext = path.split(".").pop();
  const upload = await uploadLocalImage({
    bucket: PROOF_BUCKET,
    path,
    uri: photoUri,
    contentType:
      ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg",
  });
  const already =
    !upload.ok &&
    (upload.failure.error?.statusCode === "409" ||
      upload.failure.error?.code === "ResourceAlreadyExists");
  if (!upload.ok && !already) {
    throw new Error(
      "Could not upload the receipt photo. Check your connection and try again."
    );
  }
  check(
    await supabase.rpc("rider_pabakal_bought", {
      p_id: id,
      p_item_cost: itemCost,
      p_receipt_path: path,
    })
  );
  // The customer hears each step (P2). Best-effort, never blocks.
  void postApi("/api/pabakal/notify", { id });
}

export async function markPabakalDelivered(id: string, cash: number): Promise<void> {
  check(
    await supabase.rpc("rider_pabakal_delivered", { p_id: id, p_cash_collected: cash })
  );
  // The customer hears each step (P2). Best-effort, never blocks.
  void postApi("/api/pabakal/notify", { id });
}

/**
 * Add a follow-up message's stops to the list so far. Items for a store
 * already on the list join it (store names compared without case), and items
 * with no store join the list's unnamed store, so a customer who adds more
 * before naming the store still has one store box to fill.
 */
export function mergeStops(list: StopDraft[], more: StopDraft[]): StopDraft[] {
  const merged = list.map((s) => ({ ...s, items: [...s.items] }));
  for (const stop of more) {
    const key = stop.store.trim().toLowerCase();
    const same = merged.find((s) => s.store.trim().toLowerCase() === key);
    if (same) same.items.push(...stop.items);
    else merged.push({ ...stop, items: [...stop.items] });
  }
  return merged;
}

/** What a rider's delivered pabakal earned them: both fees, kept in full (0120). */
export function pabakalEarnings(
  rows: { delivery_fee: number; pabakal_fee: number; delivered_at: string | null }[],
  now: Date
) {
  const dayStart = (back: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - back).getTime();
  const totals = { today: 0, week: 0, total: 0, count: 0 };
  for (const r of rows) {
    if (!r.delivered_at) continue;
    const at = new Date(r.delivered_at).getTime();
    const fee = r.delivery_fee + r.pabakal_fee;
    totals.total += fee;
    totals.count += 1;
    if (at >= dayStart(6)) totals.week += fee;
    if (at >= dayStart(0)) totals.today += fee;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    today: round(totals.today),
    week: round(totals.week),
    total: round(totals.total),
    count: totals.count,
  };
}

/** The rider's own delivered pabakal (RLS returns only theirs). */
export async function fetchMyDeliveredPabakal() {
  return (
    check(
      await supabase
        .from("pabakal_requests")
        .select("delivery_fee, pabakal_fee, delivered_at")
        .eq("status", "delivered")
    ) ?? []
  );
}

/**
 * Medicines a Philippine pharmacy sells only with a prescription. Not every
 * one: the common ones a pabakal list will name, so the customer is warned
 * before the rider is turned away at the counter.
 */
const PRESCRIPTION_ONLY = new Set([
  "amoxicillin",
  "co-amoxiclav",
  "azithromycin",
  "clarithromycin",
  "cefalexin",
  "cephalexin",
  "cefuroxime",
  "ciprofloxacin",
  "doxycycline",
  "cotrimoxazole",
  "metronidazole",
  "losartan",
  "amlodipine",
  "metoprolol",
  "atenolol",
  "metformin",
  "glimepiride",
  "simvastatin",
  "atorvastatin",
  "rosuvastatin",
  "prednisone",
  "tramadol",
  "celecoxib",
]);

/** The prescription-only medicines on a list, each named once. */
export function prescriptionItems(stops: StopDraft[]): string[] {
  const found = new Map<string, string>();
  for (const stop of stops) {
    for (const item of stop.items) {
      for (const word of item.name.toLowerCase().split(/[^a-z-]+/)) {
        if (PRESCRIPTION_ONLY.has(word) && !found.has(word)) {
          found.set(word, word.charAt(0).toUpperCase() + word.slice(1));
        }
      }
    }
  }
  return [...found.values()];
}

/** The rider on the customer's own pabakal, while a rider has it (0139). */
export async function fetchPabakalRider(
  id: string
): Promise<{ name: string; phone: string | null } | null> {
  const { data, error } = await supabase.rpc("pabakal_rider_contact", { p_id: id });
  if (error) throw error;
  const row = data?.[0];
  return row ? { name: row.rider_name, phone: row.rider_phone ?? null } : null;
}

/** A short-lived link to a pabakal's receipt photo, for its customer (0140). */
export async function receiptUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(path, 600);
  return error ? null : data.signedUrl;
}
