import { supabase } from "./client";
import type {
  Customer,
  MenuItem,
  Order,
  OrderItem,
  Restaurant,
  Rider,
} from "@/lib/types";

export type RestaurantInput = {
  name: string;
  cuisine: string;
  city: string;
  rating?: number;
  ordersCount?: number;
  revenue?: number;
  status: Restaurant["status"];
  joinedAt?: string;
};

export type RiderInput = {
  name: string;
  email: string;
  phone?: string;
  city?: string;
  vehicle: Rider["vehicle"];
  status: Rider["status"];
  deliveries?: number;
  rating?: number;
  earnings?: number;
};

export type MenuItemInput = {
  restaurant: string;
  name: string;
  category: string;
  price: number;
  available?: boolean;
};

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function upsertRestaurant(
  input: RestaurantInput,
  existingId?: string,
): Promise<void> {
  const id = existingId ?? makeId("rst");
  const { error } = await supabase
    .from("restaurants")
    .upsert(
      {
        id,
        name: input.name,
        cuisine: input.cuisine,
        city: input.city,
        rating: input.rating ?? 0,
        orders_count: input.ordersCount ?? 0,
        revenue: input.revenue ?? 0,
        status: input.status,
        joined_at: input.joinedAt ?? new Date().toISOString().slice(0, 10),
      },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}

export async function upsertRider(
  input: RiderInput,
  existingId?: string,
): Promise<void> {
  const id = existingId ?? makeId("rdr");
  const { error } = await supabase
    .from("riders")
    .upsert(
      {
        id,
        name: input.name,
        email: input.email,
        phone: input.phone ?? "",
        city: input.city ?? "Kabankalan City Proper",
        vehicle: input.vehicle,
        status: input.status,
        deliveries: input.deliveries ?? 0,
        rating: input.rating ?? 0,
        earnings: input.earnings ?? 0,
      },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}

export async function upsertMenuItem(
  input: MenuItemInput,
  existingId?: string,
): Promise<void> {
  const id = existingId ?? makeId("mnu");
  const { error } = await supabase
    .from("menu_items")
    .upsert(
      {
        id,
        restaurant: input.restaurant,
        name: input.name,
        category: input.category,
        price: input.price,
        available: input.available ?? true,
      },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}

export async function setMenuItemAvailable(
  id: string,
  available: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("menu_items")
    .update({ available })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setRiderStatus(
  id: string,
  status: Rider["status"],
): Promise<void> {
  const { error } = await supabase.from("riders").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

type DbRecord<T> = T & Record<string, unknown>;

function mapItems(raw: unknown): OrderItem[] {
  if (Array.isArray(raw)) return raw as OrderItem[];
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as OrderItem[];
    } catch {
      return [];
    }
  }
  return [];
}

export async function fetchRestaurants(): Promise<Restaurant[]> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .order("name");

  if (error) throw new Error(error.message);

  return ((data ?? []) as DbRecord<Restaurant>[]).map((r) => ({
    id: r.id,
    name: r.name,
    cuisine: r.cuisine,
    city: r.city,
    rating: Number(r.rating),
    ordersCount: Number(r.orders_count),
    revenue: Number(r.revenue),
    status: r.status,
    joinedAt: String(r.joined_at).slice(0, 10),
  }));
}

export async function fetchRiders(): Promise<Rider[]> {
  const { data, error } = await supabase
    .from("riders")
    .select("*")
    .order("name");

  if (error) throw new Error(error.message);

  return ((data ?? []) as DbRecord<Rider>[]).map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    city: r.city,
    vehicle: r.vehicle,
    status: r.status,
    deliveries: Number(r.deliveries),
    rating: Number(r.rating),
    earnings: Number(r.earnings),
  }));
}

export async function fetchCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("name");

  if (error) throw new Error(error.message);

  return ((data ?? []) as DbRecord<Customer>[]).map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    city: c.city,
    ordersCount: Number(c.orders_count),
    totalSpend: Number(c.total_spend),
    joinedAt: String(c.joined_at).slice(0, 10),
  }));
}

export async function fetchMenuItems(): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from("menu_items")
    .select("*")
    .order("name");

  if (error) throw new Error(error.message);

  return ((data ?? []) as DbRecord<MenuItem>[]).map((m) => ({
    id: m.id,
    restaurant: m.restaurant,
    name: m.name,
    category: m.category,
    price: Number(m.price),
    available: Boolean(m.available),
  }));
}

export async function fetchOrders(): Promise<Order[]> {
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
  }));
}