import { supabase } from "./client";
import { fetchUserRole } from "@/lib/role";
import type { MenuItem, Order, OrderItem } from "@/lib/types";
import type { DbRecord } from "./queries";

/**
 * Merchant-scoped queries.
 *
 * These do not filter by restaurant_id in application code. Row Level
 * Security already restricts the signed-in merchant to their own restaurant
 * (see 0002_merchant.sql), so adding a client-side filter would be security
 * theatre: it would hide nothing from the database, and a bug in it would
 * silently widen what the user sees. The scope is enforced once, in the
 * database, where it cannot be bypassed.
 */

export type { DbRecord };

export type { Order, MenuItem } from "@/lib/types";

function mapItems(raw: unknown): OrderItem[] {
  if (!Array.isArray(raw)) return [];
  return raw as OrderItem[];
}

export async function fetchMerchantOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("placed_at", { ascending: false });

  if (error) throw new Error(error.message);

  return ((data ?? []) as DbRecord<Order>[]).map((o) => ({
    id: o.id,
    reference: o.reference,
    customer: o.customer,
    restaurant: o.restaurant,
    items: mapItems(o.items),
    subtotal: Number(o.subtotal),
    deliveryFee: Number(o.delivery_fee),
    total: Number(o.total),
    status: o.status,
    payment: o.payment,
    placedAt: String(o.placed_at),
    rider: o.rider,
    // Mapped on both the merchant and admin paths. A field present in one
    // mapper and missing from the other is how this drifts (Prompt 2.5).
    // Coerced explicitly: DbRecord types unmapped columns as `unknown`, and
    // orders cancelled before the column existed come back null.
    rejectionReason:
      typeof o.rejection_reason === "string" ? o.rejection_reason : null,
  }));
}

export async function fetchMerchantMenu(): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from("menu_items")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return ((data ?? []) as DbRecord<MenuItem>[]).map((m) => ({
    id: m.id,
    restaurant: m.restaurant,
    name: m.name,
    category: m.category,
    price: Number(m.price),
    available: m.available,
  }));
}

export type MerchantOrderStatus = Order["status"];

const MERCHANT_TRANSITIONS: Record<MerchantOrderStatus, MerchantOrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
};

/**
 * Statuses a merchant may move an order to from its current one. The rider
 * leg (out_for_delivery -> delivered) is deliberately excluded: dispatch is
 * the platform's job, not the restaurant's.
 */
export function allowedTransitions(
  status: MerchantOrderStatus
): MerchantOrderStatus[] {
  return (MERCHANT_TRANSITIONS[status] ?? []).filter(
    (next) => next !== "out_for_delivery"
  );
}

export async function setOrderStatus(
  id: string,
  status: MerchantOrderStatus,
  reason?: string,
): Promise<void> {
  // The reason is written in the SAME statement as the status change. Two round
  // trips would let the status succeed while the reason was lost, which is
  // precisely the bug Prompt 2.5 exists to close.
  //
  // The reason is set only when cancelling, and is explicitly cleared for every
  // other transition, so an order that was cancelled with a reason and later
  // moved on does not keep a stale justification attached.
  const patch: { status: MerchantOrderStatus; rejection_reason: string | null } = {
    status,
    rejection_reason:
      status === "cancelled" ? (reason?.trim() || null) : null,
  };

  const { error } = await supabase.from("orders").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export type MerchantMenuItemInput = {
  name: string;
  category: string;
  price: number;
  available?: boolean;
};

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create or update a menu item. restaurant_id comes from the caller's
 * app_users row, never from the form, so a merchant cannot attach an item to
 * another restaurant by tampering with the request.
 */
export async function saveMenuItem(
  id: string | null,
  input: MerchantMenuItemInput
): Promise<void> {
  const profile = await fetchUserRole();
  if (!profile.restaurantId) {
    throw new Error("Your account is not attached to a restaurant yet.");
  }

  const payload = {
    id: id ?? makeId("mnu"),
    restaurant: profile.restaurantName ?? profile.restaurantId,
    restaurant_id: profile.restaurantId,
    name: input.name,
    category: input.category,
    price: input.price,
    available: input.available ?? true,
  };

  const query = id
    ? supabase.from("menu_items").update(payload).eq("id", id)
    : supabase.from("menu_items").insert(payload);

  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function deleteMenuItem(id: string): Promise<void> {
  const { error } = await supabase.from("menu_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setMenuAvailability(
  id: string,
  available: boolean
): Promise<void> {
  const { error } = await supabase
    .from("menu_items")
    .update({ available })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
