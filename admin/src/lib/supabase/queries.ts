import { supabase } from "./client";
import { anyIlikeFilter } from "./ilike-filter";
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

/**
 * Archive / restore, for Prompt 3.2.
 *
 * `archived` sets `archived_at` to now; unsetting it restores the row. A hard
 * delete is deliberately not offered for either entity -- see migration
 * 0010_archive.sql for what deleting a restaurant would actually do to its
 * order history, menu and merchant login.
 *
 * The timestamp comes from the client, matching the existing `joinedAt` handling
 * in `upsertRestaurant`. It is only ever read back for display -- nothing sorts
 * or filters on it -- so a skewed device clock is not worth a database round
 * trip to avoid.
 */
async function setArchived(table: "restaurants" | "riders", id: string, archived: boolean): Promise<void> {
  const { error } = await supabase
    .from(table)
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export const setRestaurantArchived = (id: string, archived: boolean): Promise<void> =>
  setArchived("restaurants", id, archived);

export const setRiderArchived = (id: string, archived: boolean): Promise<void> =>
  setArchived("riders", id, archived);

export type DbRecord<T> = T & Record<string, unknown>;

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

/**
 * `orders_count` and `revenue` here are LIVE, maintained by the trigger in
 * migration 0008_aggregate_refresh.sql (recomputed on every order INSERT,
 * UPDATE and DELETE, excluding cancelled orders).
 *
 * Compare `fetchCustomers` below, whose equivalent columns are still frozen
 * seed values.
 */
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
    archivedAt: r.archived_at ? String(r.archived_at) : null,
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
    archivedAt: r.archived_at ? String(r.archived_at) : null,
  }));
}

/**
 * WARNING -- `ordersCount` and `totalSpend` are SEED-TIME CONSTANTS, not live
 * aggregates. They were written once by the insert in 0001_init.sql:182 and are
 * never recomputed. Prompt 2.4 investigated making them real and concluded it
 * is not possible today: `orders.customer` is free text with no foreign key to
 * `customers`, so the only available join is on a name string, which
 * misattributes orders between same-named customers.
 *
 * Unlike `restaurants.orders_count` / `restaurants.revenue`, which migration
 * 0008 made live, these two must not be treated as business metrics, and the
 * Gold/Silver/Standard tiers derived from `totalSpend` in the Customers page
 * are therefore also sample data. The UI labels them as such.
 *
 * Making them real requires giving orders a `customer_id uuid references
 * auth.users(id)` and backfilling by name match with a report of unmatched
 * rows -- a schema and data-migration decision, not a UI fix.
 */
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
    // Mapped on both the merchant and admin paths. A field present in one
    // mapper and missing from the other is how this drifts (Prompt 2.5).
    // Coerced explicitly: DbRecord types unmapped columns as `unknown`, and
    // orders cancelled before the column existed come back null.
    rejectionReason:
      typeof o.rejection_reason === "string" ? o.rejection_reason : null,
  }));
}

// ---------------------------------------------------------------------------
// Global search (Prompt 3.1)
// ---------------------------------------------------------------------------

export type SearchEntity =
  | "order"
  | "restaurant"
  | "rider"
  | "customer"
  | "menu_item";

/**
 * One row of the search popover. `entity` is a discriminant so the UI can
 * label and group without string-matching the subtitle.
 *
 * Every field except `entity` is a string on purpose: the popover renders
 * rows from five different tables with five different shapes, and a union of
 * five object types would only move the `!` around.
 */
export type SearchResult = {
  entity: SearchEntity;
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export const SEARCH_ENTITY_LABELS: Record<SearchEntity, string> = {
  order: "Order",
  restaurant: "Restaurant",
  rider: "Rider",
  customer: "Customer",
  menu_item: "Menu item",
};

/** Per entity, not overall: a search for "a" should not drown in orders. */
const PER_ENTITY = 5;

/** Below this, `ilike '%x%'` matches most of the table and returns noise. */
const MIN_TERM_LENGTH = 2;

function listHref(path: string, term: string): string {
  return `${path}?q=${encodeURIComponent(term)}`;
}

/**
 * One search across every table the admin can see, issued as five parallel
 * requests. No index and no database search function: the spec forbids both,
 * and at this table size a sequential `ilike` scan per table is not the
 * bottleneck.
 *
 * Authorization is not applied here and must not be. Every request goes
 * through the same session-scoped client as the rest of the app, so the
 * `select` policies decide what a merchant can see exactly as they do for the
 * list pages. Adding a filter that trusts a role from the client would be
 * strictly weaker than what the database already enforces.
 */
export async function searchEverything(
  term: string,
): Promise<SearchResult[]> {
  const trimmed = term.trim();
  if (trimmed.length < MIN_TERM_LENGTH) return [];


  const [orders, restaurants, riders, customers, menuItems] = await Promise.all([
    supabase
      .from("orders")
      .select("id, reference, customer, restaurant, status, total, placed_at")
      .or(anyIlikeFilter(["reference", "customer", "restaurant"], trimmed))
      .order("placed_at", { ascending: false })
      .limit(PER_ENTITY),
    supabase
      .from("restaurants")
      .select("id, name, cuisine, city, status")
      .or(anyIlikeFilter(["name", "cuisine", "city"], trimmed))
      .is("archived_at", null)
      .order("name")
      .limit(PER_ENTITY),
    supabase
      .from("riders")
      .select("id, name, email, phone, vehicle, status")
      .or(anyIlikeFilter(["name", "email", "phone", "city"], trimmed))
      .is("archived_at", null)
      .order("name")
      .limit(PER_ENTITY),
    supabase
      .from("customers")
      .select("id, name, email, phone, city")
      .or(anyIlikeFilter(["name", "email", "phone", "city"], trimmed))
      .order("name")
      .limit(PER_ENTITY),
    supabase
      .from("menu_items")
      .select("id, name, category, restaurant, price")
      .or(anyIlikeFilter(["name", "category", "restaurant"], trimmed))
      .order("name")
      .limit(PER_ENTITY),
  ]);

  const responses = [orders, restaurants, riders, customers, menuItems];
  const failures = responses.filter((r) => r.error);

  // Partial results are worth showing; five failures are an outage, and
  // rendering that as "no matches for X" would be a lie.
  if (failures.length === responses.length) {
    throw new Error(failures[0]?.error?.message ?? "Search failed.");
  }

  const results: SearchResult[] = [];

  for (const { data } of responses) {
    if (!data) continue;
    for (const raw of data as Record<string, unknown>[]) {
      const row = raw as DbRecord<Record<string, unknown>>;
      results.push(toSearchResult(row, trimmed));
    }
  }

  return results;
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

/**
 * Normalizes the five differently-shaped rows into one shape. Kept as a
 * `switch` on the entity so a new entity cannot be added without deciding what
 * its title and subtitle are: an unmapped entity throws instead of rendering
 * a blank row.
 */
function toSearchResult(
  row: Record<string, unknown>,
  label: string,
): SearchResult {
  const id = text(row.id);

  if ("reference" in row) {
    return {
      entity: "order",
      id,
      title: text(row.reference),
      subtitle: [text(row.customer), text(row.restaurant), text(row.status)]
        .filter(Boolean)
        .join(" · "),
      href: listHref("/orders", label),
    };
  }
  if ("cuisine" in row) {
    return {
      entity: "restaurant",
      id,
      title: text(row.name),
      subtitle: [text(row.cuisine), text(row.city), text(row.status)]
        .filter(Boolean)
        .join(" · "),
      href: listHref("/restaurants", label),
    };
  }
  if ("vehicle" in row) {
    return {
      entity: "rider",
      id,
      title: text(row.name),
      subtitle: [text(row.vehicle), text(row.status), text(row.phone)]
        .filter(Boolean)
        .join(" · "),
      href: listHref("/riders", label),
    };
  }
  if ("price" in row) {
    return {
      entity: "menu_item",
      id,
      title: text(row.name),
      subtitle: [text(row.restaurant), text(row.category)]
        .filter(Boolean)
        .join(" · "),
      href: listHref("/menu", label),
    };
  }
  return {
    entity: "customer",
    id,
    title: text(row.name),
    subtitle: [text(row.email), text(row.phone), text(row.city)]
      .filter(Boolean)
      .join(" · "),
    href: listHref("/customers", label),
  };
}
// ---------------------------------------------------------------------------
// Merchant access (Prompt 3.3)
// ---------------------------------------------------------------------------

/**
 * One row of the Merchant access page. `email` and `restaurantName` are joined
 * in SQL rather than fetched here: `auth.users` is not exposed to the
 * authenticated role, and `app_users` stores no address, so the browser cannot
 * assemble this row itself.
 */
export type MerchantAccess = {
  userId: string;
  email: string;
  role: "admin" | "merchant";
  restaurantId: string | null;
  restaurantName: string | null;
  createdAt: string;
};

function requireOk<T>(error: { message: string } | null, value: T): T {
  if (error) throw new Error(error.message);
  return value;
}

export async function fetchMerchantAccess(): Promise<MerchantAccess[]> {
  const { data, error } = await supabase.rpc("merchant_access_list");

  return requireOk(error, ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    userId: String(row.user_id),
    email: String(row.email),
    role: row.role === "admin" ? ("admin" as const) : ("merchant" as const),
    restaurantId: row.restaurant_id == null ? null : String(row.restaurant_id),
    restaurantName:
      row.restaurant_name == null ? null : String(row.restaurant_name),
    createdAt: String(row.created_at),
  })));
}

/**
 * Attach an existing account to a restaurant, or move it to another one.
 *
 * The email is the only identifier an operator has, and it is resolved to a
 * user_id in the database: this cannot create an account, and if the address
 * does not exist the function says so instead of silently doing nothing.
 */
export async function setMerchantAccess(
  email: string,
  restaurantId: string,
): Promise<void> {
  const { error } = await supabase.rpc("set_merchant_access", {
    p_email: email,
    p_restaurant_id: restaurantId,
  });
  requireOk(error, undefined);
}

/**
 * Remove merchant access. The auth account survives: revoking console access is
 * a provisioning decision, and destroying the login is a separate, deliberate
 * one.
 */
export async function revokeMerchantAccess(email: string): Promise<void> {
  const { error } = await supabase.rpc("revoke_merchant_access", {
    p_email: email,
  });
  requireOk(error, undefined);
}
