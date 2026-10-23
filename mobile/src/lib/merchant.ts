import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImageManipulator from "expo-image-manipulator";
import { supabase } from "./supabase";
import { postApi } from "./admin-api";
import { uploadLocalImage } from "./image-upload";
import { targetWidthFor } from "./image-sizing";
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

/**
 * Every delivered order's id and food subtotal, for the all-time total. Paged,
 * because the API stops at 1000 rows without saying so.
 */
export async function fetchDeliveredAllTime(): Promise<
  { id: string; subtotal: number }[]
> {
  const rows: { id: string; subtotal: number }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("orders")
      .select("id, subtotal")
      .eq("status", "delivered")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []).map((o) => ({ id: o.id, subtotal: Number(o.subtotal) })));
    if ((data ?? []).length < 1000) return rows;
  }
}

/** Refunded amount per order (0084). RLS limits it to this restaurant. */
export async function fetchMerchantRefunds(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  // Paged: the all-time total reads every refund, past the API's 1000-row cap.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("order_refunds")
      .select("order_id, amount")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? [])
      map.set(r.order_id, (map.get(r.order_id) ?? 0) + Number(r.amount));
    if ((data ?? []).length < 1000) return map;
  }
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
  imageUrl: string | null;
}

export async function fetchMerchantMenu(
  restaurantId: string
): Promise<MerchantMenuItem[]> {
  const { data, error } = await supabase
    .from("menu_items")
    .select("id, name, category, price, available, image_url")
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
    imageUrl: m.image_url ?? null,
  }));
}

export interface MenuItemInput {
  name: string;
  category: string;
  price: number;
  available: boolean;
  imageUrl: string | null;
}

/**
 * Create or update a menu item, the way the web portal does: the restaurant
 * comes from the session's role, never from the form, and RLS refuses an item
 * for any other restaurant (0002).
 */
export async function saveMenuItem(
  restaurant: { id: string; name: string | null },
  id: string | null,
  input: MenuItemInput
): Promise<void> {
  const payload = {
    restaurant: restaurant.name ?? restaurant.id,
    restaurant_id: restaurant.id,
    name: input.name.trim(),
    category: input.category.trim() || "Other",
    price: input.price,
    available: input.available,
    image_url: input.imageUrl,
  };
  const { error } = id
    ? await supabase.from("menu_items").update(payload).eq("id", id)
    : await supabase
        .from("menu_items")
        .insert({ ...payload, id: `mnu_${Math.random().toString(36).slice(2, 10)}` });
  if (error) throw error;
}

export async function deleteMenuItem(id: string): Promise<void> {
  const { error } = await supabase.from("menu_items").delete().eq("id", id);
  if (error) throw error;
}

export const MENU_IMAGE_BUCKET = "menu-images";

/**
 * Make a photo small enough to upload.
 *
 * A phone camera takes 12 megapixels, so the photo a merchant picks is 1-2 MB
 * and is uploaded whole: a minute on a rural connection, a merchant waiting
 * in their kitchen, and a bucket full of the same plate at four times the size
 * it needs to be. 800px is wide enough for the card the photo appears on.
 *
 * A photo that is already narrow enough is uploaded as it is -- enlarging it
 * would only make it blurrier -- and so is one whose size cannot be read.
 *
 * If the resize itself fails the original photo is used: a big photo is a
 * slow upload, a failed upload is a merchant with no photo at all.
 */
export async function preparePhotoForUpload(uri: string): Promise<string> {
  try {
    const original =
      await ImageManipulator.ImageManipulator.manipulate(uri).renderAsync();
    const width = targetWidthFor(original.width);
    if (width === null) return uri;

    const resized = ImageManipulator.ImageManipulator.manipulate(uri);
    resized.resize({ width });
    const saved = await resized.renderAsync().then((image) =>
      image.saveAsync({
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      })
    );
    return saved.uri;
  } catch {
    return uri;
  }
}

/**
 * Upload a menu photo and return its public URL (0086). The first folder is the
 * restaurant id, which is what the storage policy checks; a fresh name per
 * upload means a replaced photo never needs an overwrite permission.
 * shortcut: the previous photo stays in the bucket when replaced; add cleanup
 * if storage use ever matters.
 */
export async function uploadMenuImage(
  restaurantId: string,
  uri: string
): Promise<string> {
  const lower = uri.toLowerCase();
  const ext = lower.endsWith(".png") ? "png" : lower.endsWith(".webp") ? "webp" : "jpg";
  const contentType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  const uploadUri = await preparePhotoForUpload(uri);
  const path = `${restaurantId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const outcome = await uploadLocalImage({
    bucket: MENU_IMAGE_BUCKET,
    path,
    uri: uploadUri,
    contentType,
  });

  if (!outcome.ok) {
    if (outcome.failure.kind === "unreadable") {
      throw new Error("Could not read that photo. Pick it again.");
    }
    throw new Error("Could not upload the photo. Check your connection and try again.");
  }
  return supabase.storage.from(MENU_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
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
  /** Shop photo (0090), or null. */
  imageUrl?: string | null;
  /** Daily opening and closing time, "HH:MM:SS" (0137); both null: no set hours. */
  opensAt?: string | null;
  closesAt?: string | null;
}

export async function fetchStoreStatus(
  restaurantId: string
): Promise<StoreStatus | null> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("is_open, prep_minutes, image_url, opens_at, closes_at")
    .eq("id", restaurantId)
    .maybeSingle();
  if (error) throw error;
  return data
    ? {
        isOpen: Boolean(data.is_open),
        prepMinutes: Number(data.prep_minutes),
        imageUrl: data.image_url ?? null,
        opensAt: data.opens_at ?? null,
        closesAt: data.closes_at ?? null,
      }
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

/**
 * The shop's daily hours (0137), "HH:MM" each, or both null for none. The shop
 * opens and closes itself at these times; the switch still works in between.
 */
export async function saveHours(
  opens: string | null,
  closes: string | null
): Promise<void> {
  const { error } = await supabase.rpc("merchant_set_hours", {
    p_opens: opens ?? undefined,
    p_closes: closes ?? undefined,
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

export function useSaveHours(restaurantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { opens: string | null; closes: string | null }) =>
      saveHours(args.opens, args.closes),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["storeStatus", restaurantId] }),
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

export function useDeliveredAllTime() {
  return useQuery({ queryKey: ["merchantAllTime"], queryFn: fetchDeliveredAllTime });
}

export function useSaveMenuItem(
  restaurant: { id: string; name: string | null } | null
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string | null; input: MenuItemInput }) => {
      if (!restaurant)
        throw new Error("Your account is not attached to a restaurant yet.");
      return saveMenuItem(restaurant, args.id, args.input);
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: ["merchantMenu", restaurant?.id ?? null],
      }),
  });
}

export function useDeleteMenuItem(restaurantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMenuItem(id),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["merchantMenu", restaurantId] }),
  });
}

/**
 * Upload a shop photo into the restaurant's folder and set it (0090). The
 * server accepts only a URL inside that folder.
 */
export async function setShopImage(restaurantId: string, uri: string): Promise<void> {
  const url = await uploadMenuImage(restaurantId, uri);
  const { error } = await supabase.rpc("merchant_set_shop_image", { p_url: url });
  if (error) throw error;
}

export function useSetShopImage(restaurantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (uri: string) => {
      if (!restaurantId)
        throw new Error("Your account is not attached to a restaurant yet.");
      return setShopImage(restaurantId, uri);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["storeStatus", restaurantId] }),
  });
}
