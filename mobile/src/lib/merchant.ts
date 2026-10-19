import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { postApi } from "./admin-api";
import type { OrderStatus } from "./merchant-logic";

/**
 * Data for the merchant surface (restaurant owners and staff).
 *
 * Every read is scoped by RLS to the merchant's own restaurant (0002, 0083);
 * the restaurant id is also passed explicitly where a table is readable more
 * widely (restaurants is a public catalogue). Writes are the same ones the web
 * portal makes: status and rejection_reason on orders (all a client may change
 * since 0083), availability on menu items, and merchant_set_store_status.
 */

export interface MerchantOrder {
  id: string;
  reference: string;
  customer: string;
  status: OrderStatus;
  placedAt: string;
  subtotal: number;
  rider: string | null;
  rejectionReason: string | null;
  items: { name: string; quantity: number }[];
}

function parseItems(value: unknown): { name: string; quantity: number }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (entry === null || typeof entry !== "object") return [];
    const { name, quantity } = entry as Record<string, unknown>;
    return typeof name === "string" && typeof quantity === "number"
      ? [{ name, quantity }]
      : [];
  });
}

/**
 * Open orders plus the last 30 days, which is everything the Orders and Sales
 * tabs show.
 * shortcut: one read capped at 1000 rows (the API cap); a restaurant doing more
 * than ~1000 orders a month needs paging like admin/src/lib/fetch-all.ts.
 */
export async function fetchMerchantOrders(): Promise<MerchantOrder[]> {
  const since = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, reference, customer, status, placed_at, subtotal, rider, rejection_reason, items"
    )
    .or(
      `placed_at.gte.${since},status.in.(pending,confirmed,preparing,out_for_delivery)`
    )
    .order("placed_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((o) => ({
    id: o.id,
    reference: o.reference,
    customer: o.customer,
    status: o.status as OrderStatus,
    placedAt: String(o.placed_at),
    subtotal: Number(o.subtotal),
    rider: o.rider || null,
    rejectionReason: o.rejection_reason ?? null,
    items: parseItems(o.items),
  }));
}

/** Refunded amount per order (0084). RLS limits it to this restaurant. */
export async function fetchMerchantRefunds(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("order_refunds")
    .select("order_id, amount")
    .limit(1000);
  if (error) throw error;
  const map = new Map<string, number>();
  for (const r of data ?? [])
    map.set(r.order_id, (map.get(r.order_id) ?? 0) + Number(r.amount));
  return map;
}

/**
 * Move an order on, then send the same follow-ups the web portal sends: the
 * customer's status email, and on acceptance the rider alert for the offers
 * auto-dispatch just created (0085). Both are best-effort; the status change
 * is what counts and it is already saved when they run.
 */
export async function setMerchantOrderStatus(
  orderId: string,
  status: OrderStatus,
  reason?: string
): Promise<void> {
  const { error } = await supabase
    .from("orders")
    .update({
      status,
      rejection_reason: status === "cancelled" ? reason?.trim() || null : null,
    })
    .eq("id", orderId);
  if (error) throw error;

  if (status === "confirmed") void postApi("/api/dispatch/notify", { orderId });
  void postApi("/api/orders/notify", {
    orderId,
    event: "status_changed",
    ...(status === "cancelled" && reason ? { reason: reason.trim() } : {}),
  });
}

export interface MerchantMenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  available: boolean;
}

export async function fetchMerchantMenu(
  restaurantId: string
): Promise<MerchantMenuItem[]> {
  const { data, error } = await supabase
    .from("menu_items")
    .select("id, name, category, price, available")
    .eq("restaurant_id", restaurantId)
    .order("category")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    category: m.category ?? "Other",
    price: Number(m.price),
    available: Boolean(m.available),
  }));
}

export async function setMenuItemAvailable(
  id: string,
  available: boolean
): Promise<void> {
  const { error } = await supabase
    .from("menu_items")
    .update({ available })
    .eq("id", id);
  if (error) throw error;
}

export interface StoreStatus {
  isOpen: boolean;
  prepMinutes: number;
}

export async function fetchStoreStatus(
  restaurantId: string
): Promise<StoreStatus | null> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("is_open, prep_minutes")
    .eq("id", restaurantId)
    .maybeSingle();
  if (error) throw error;
  return data
    ? { isOpen: Boolean(data.is_open), prepMinutes: Number(data.prep_minutes) }
    : null;
}

export async function saveStoreStatus(
  isOpen: boolean,
  prepMinutes: number
): Promise<void> {
  const { error } = await supabase.rpc("merchant_set_store_status", {
    p_is_open: isOpen,
    p_prep_minutes: prepMinutes,
  });
  if (error) throw error;
}

/* ------------------------------------------------------------------ *
 * Hooks
 * ------------------------------------------------------------------ */

/** 15s poll on top of push alerts, so the list is never far behind. */
export function useMerchantOrders() {
  return useQuery({
    queryKey: ["merchantOrders"],
    queryFn: fetchMerchantOrders,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useMerchantRefunds() {
  return useQuery({ queryKey: ["merchantRefunds"], queryFn: fetchMerchantRefunds });
}

export function useSetMerchantOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { orderId: string; status: OrderStatus; reason?: string }) =>
      setMerchantOrderStatus(args.orderId, args.status, args.reason),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["merchantOrders"] }),
  });
}

export function useMerchantMenu(restaurantId: string | null) {
  return useQuery({
    queryKey: ["merchantMenu", restaurantId],
    queryFn: () => fetchMerchantMenu(restaurantId as string),
    enabled: !!restaurantId,
  });
}

export function useSetMenuItemAvailable(restaurantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; available: boolean }) =>
      setMenuItemAvailable(args.id, args.available),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["merchantMenu", restaurantId] }),
  });
}

export function useStoreStatus(restaurantId: string | null) {
  return useQuery({
    queryKey: ["storeStatus", restaurantId],
    queryFn: () => fetchStoreStatus(restaurantId as string),
    enabled: !!restaurantId,
  });
}

export function useSaveStoreStatus(restaurantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: StoreStatus) => saveStoreStatus(args.isOpen, args.prepMinutes),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["storeStatus", restaurantId] }),
  });
}
