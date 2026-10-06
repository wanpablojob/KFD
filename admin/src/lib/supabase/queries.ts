import { supabase } from "./client";
import { anyIlikeFilter } from "./ilike-filter";
import {
  riderProfilePatch,
  type RiderProfileInput,
} from "@/lib/rider-profile";
import {
  mapPayouts,
  mapPayoutSummary,
  type RiderPayout,
  type RiderPayoutSummary,
} from "@/lib/rider-ledger";
import {
  RIDER_ORDER_COLUMNS,
  mapRiderOrderRows,
  riderOrderScope,
  type RiderDeliveryPage,
} from "@/lib/rider-orders";
import type {
  Customer,
  MenuItem,
  Order,
  OrderItem,
  Restaurant,
  Rider,
  RiderActivityEvent,
  RiderEarningsDay,
  RiderNote,
  RiderOverview,
  VehicleType,
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

/**
 * A new rider. `status` is set here because a rider is created with an
 * availability choice; nothing else is set, because everything else on the row
 * is the database's to maintain.
 */
export type RiderInput = RiderProfileInput & {
  vehicle: Rider["vehicle"];
  status: Rider["status"];
};

export type MenuItemInput = {
  restaurant: string;
  /**
   * Required since migration 0027 made menu_items.restaurant_id NOT NULL: an
   * item that cannot be attributed to a restaurant is an orphan no role can
   * see, and it cannot be priced into an order.
   */
  restaurant_id: string;
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
  const { error } = await supabase.from("restaurants").upsert(
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

/**
 * Create a rider.
 *
 * The three counters are written explicitly as zero rather than left out: this
 * is an insert, so the columns need a value, and a default of 0 is the truth
 * for a rider who has not delivered anything. It is only safe here because an
 * insert cannot overwrite anything -- which is exactly why this is not the
 * function an edit uses.
 */
export async function createRider(input: RiderInput): Promise<string> {
  const id = makeId("rdr");
  const patch = riderProfilePatch(input);
  const { error } = await supabase.from("riders").insert({
    id,
    name: patch.name,
    email: patch.email,
    phone: patch.phone,
    city: patch.city,
    vehicle: input.vehicle,
    status: input.status,
    deliveries: 0,
    rating: 0,
    earnings: 0,
  });
  if (error) throw new Error(error.message);
  return id;
}

/**
 * Update a rider's profile.
 *
 * Sends only name, email, phone, city and vehicle. Deliveries, earnings and
 * rating are maintained by rider_mark_delivered; status has its own control
 * because it decides whether dispatch offers this rider work; archived_at and
 * suspended_at have their own RPCs so the audit row cannot be bypassed.
 *
 * A `.update`, never an upsert: an upsert would write the whole row, so passing
 * a stale read of the counters would roll back whatever the database has
 * written since the page loaded. See lib/rider-profile.ts.
 */
export async function updateRiderProfile(
  id: string,
  input: RiderProfileInput & { vehicle: Rider["vehicle"] },
): Promise<void> {
  const patch = riderProfilePatch(input);
  const { error } = await supabase
    .from("riders")
    .update({
      name: patch.name,
      email: patch.email,
      phone: patch.phone,
      city: patch.city,
      vehicle: input.vehicle,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Create or update a menu item from the admin dashboard.
 *
 * `restaurant_id` is required: migration 0027 made menu_items.restaurant_id NOT
 * NULL, because an item that cannot be attributed to a restaurant is an orphan
 * no role can see and it cannot be priced into an order.
 */
export async function upsertMenuItem(
  input: MenuItemInput,
  existingId?: string,
): Promise<void> {
  const id = existingId ?? makeId("mnu");
  const { error } = await supabase.from("menu_items").upsert(
    {
      id,
      restaurant: input.restaurant,
      restaurant_id: input.restaurant_id,
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
  const { error } = await supabase
    .from("riders")
    .update({ status })
    .eq("id", id);
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
async function setArchived(
  table: "restaurants" | "riders",
  id: string,
  archived: boolean,
): Promise<void> {
  const { error } = await supabase
    .from(table)
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export const setRestaurantArchived = (
  id: string,
  archived: boolean,
): Promise<void> => setArchived("restaurants", id, archived);

export const setRiderArchived = (
  id: string,
  archived: boolean,
): Promise<void> => setArchived("riders", id, archived);

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

  return (data ?? []).map((r) => ({
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

function mapRider(row: Record<string, unknown>): Rider {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    phone: row.phone == null ? "" : String(row.phone),
    city: String(row.city),
    vehicle: String(row.vehicle) as Rider["vehicle"],
    status: String(row.status) as Rider["status"],
    deliveries: Number(row.deliveries),
    rating: Number(row.rating),
    earnings: Number(row.earnings),
    archivedAt: row.archived_at == null ? null : String(row.archived_at),
    suspendedAt: row.suspended_at == null ? null : String(row.suspended_at),
    suspendedReason:
      row.suspended_reason == null ? null : String(row.suspended_reason),
    userId: row.user_id == null ? null : String(row.user_id),
  };
}

export async function fetchRiders(): Promise<Rider[]> {
  const { data, error } = await supabase
    .from("riders")
    .select("*")
    .order("name");

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapRider);
}

/**
 * Just id and email for every rider.
 *
 * The detail page needs this for one thing: telling an admin that the email they
 * are saving already belongs to somebody else. That check must see the whole
 * fleet, but it does not need deliveries, ratings or earnings, and the page
 * should not have to pull the entire overview to get two columns.
 */
export async function fetchRiderEmails(): Promise<{ id: string; email: string }[]> {
  const { data, error } = await supabase
    .from("riders")
    .select("id, email")
    .order("name");

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    email: String(row.email ?? ""),
  }));
}

/**
 * One rider by id.
 *
 * The detail page reads the rider directly rather than pulling the whole list
 * and finding them in it. That is not only less work: the page used to resolve
 * the rider's name from the list and then ask for orders by that name, and
 * because useAsyncData captures its fetcher once on mount, the orders query ran
 * before the list had resolved and went out with "". See fetchOrdersByRiderId.
 */
export async function fetchRiderById(id: string): Promise<Rider | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;

  const { data, error } = await supabase
    .from("riders")
    .select("*")
    .eq("id", trimmed)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapRider(data as unknown as Record<string, unknown>) : null;
}

/**
 * One rider's orders, by orders.rider_id, paginated.
 *
 * rider_id rather than the `rider` name text column: the name is not unique, so
 * two same-named riders shared a history, and 0025 says outright that the text
 * column is for receipts while rider_id is for exactly this.
 *
 * Throws on a missing id rather than returning nothing. The caller passes
 * useParams' id, which is always present, so an empty string here means the
 * page is being pointed at nothing -- and silently returning an empty list is
 * what made this read look like "this rider has no deliveries" all along.
 */
export async function fetchOrdersByRiderId(
  riderId: string,
  options: { page?: number; limit?: number } = {},
): Promise<RiderDeliveryPage> {
  const scope = riderOrderScope(riderId);
  if (!scope) {
    throw new Error("A rider id is required to read a rider's deliveries.");
  }

  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const limit = Math.max(1, Math.trunc(options.limit ?? 20));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from("orders")
    .select(RIDER_ORDER_COLUMNS, { count: "exact" })
    .eq(scope.column, scope.value)
    .order("placed_at", { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  const rows = mapRiderOrderRows(data as unknown as Record<string, unknown>[] | null);
  return {
    rows,
    page,
    total: typeof count === "number" ? count : null,
    hasMore: typeof count === "number" ? to < count : rows.length === limit,
  };
}

/**
 * WARNING -- `ordersCount` and `totalSpend` are SEED-TIME CONSTANTS, not live
 * aggregates. They were written once by the insert in 0001_init.sql:182 and are
 * never recomputed. Prompt 2.4 investigated making them real and concluded it
 * is not possible today: `orders.customer` is free text with no foreign key to
 * `/dashboard/customers`, so the only available join is on a name string, which
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

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone ?? "",
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

  return (data ?? []).map((m) => ({
    id: m.id,
    restaurant: m.restaurant,
    restaurant_id: m.restaurant_id,
    name: m.name,
    category: m.category,
    price: Number(m.price),
    available: Boolean(m.available),
  }));
}

export type DateRange = { from?: string; to?: string };

export async function fetchOrders(range?: DateRange): Promise<Order[]> {
  let query = supabase
    .from("orders")
    .select("*")
    .order("placed_at", { ascending: false });
  if (range?.from) query = query.gte("placed_at", range.from);
  if (range?.to) query = query.lte("placed_at", range.to + "T23:59:59.999Z");

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return (data ?? []).map((o) => ({
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
    rider: o.rider ?? "",
    rejectionReason:
      typeof o.rejection_reason === "string" ? o.rejection_reason : null,
    deliveryFailedReason:
      typeof o.delivery_failed_reason === "string"
        ? o.delivery_failed_reason
        : null,
    deliveryFailedAt:
      typeof o.delivery_failed_at === "string" ? o.delivery_failed_at : null,
  }));
}

export async function fetchOrdersByCustomer(
  customerName: string,
  range?: DateRange,
): Promise<Order[]> {
  let query = supabase
    .from("orders")
    .select("*")
    .eq("customer", customerName)
    .order("placed_at", { ascending: false });
  if (range?.from) query = query.gte("placed_at", range.from);
  if (range?.to) query = query.lte("placed_at", range.to + "T23:59:59.999Z");

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return (data ?? []).map((o) => ({
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
    rider: o.rider ?? "",
    rejectionReason:
      typeof o.rejection_reason === "string" ? o.rejection_reason : null,
    deliveryFailedReason:
      typeof o.delivery_failed_reason === "string"
        ? o.delivery_failed_reason
        : null,
    deliveryFailedAt:
      typeof o.delivery_failed_at === "string" ? o.delivery_failed_at : null,
  }));
}

export async function fetchOrdersByRider(
  riderName: string,
  range?: DateRange,
): Promise<Order[]> {
  let query = supabase
    .from("orders")
    .select("*")
    .eq("rider", riderName)
    .order("placed_at", { ascending: false });
  if (range?.from) query = query.gte("placed_at", range.from);
  if (range?.to) query = query.lte("placed_at", range.to + "T23:59:59.999Z");

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return (data ?? []).map((o) => ({
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
    rider: o.rider ?? "",
    rejectionReason:
      typeof o.rejection_reason === "string" ? o.rejection_reason : null,
    deliveryFailedReason:
      typeof o.delivery_failed_reason === "string"
        ? o.delivery_failed_reason
        : null,
    deliveryFailedAt:
      typeof o.delivery_failed_at === "string" ? o.delivery_failed_at : null,
  }));
}

export async function fetchOrdersByRestaurant(
  restaurantId: string,
  range?: DateRange,
): Promise<Order[]> {
  let query = supabase
    .from("orders")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("placed_at", { ascending: false });
  if (range?.from) query = query.gte("placed_at", range.from);
  if (range?.to) query = query.lte("placed_at", range.to + "T23:59:59.999Z");

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return (data ?? []).map((o) => ({
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
    rider: o.rider ?? "",
    rejectionReason:
      typeof o.rejection_reason === "string" ? o.rejection_reason : null,
    deliveryFailedReason:
      typeof o.delivery_failed_reason === "string"
        ? o.delivery_failed_reason
        : null,
    deliveryFailedAt:
      typeof o.delivery_failed_at === "string" ? o.delivery_failed_at : null,
  }));
}

export async function fetchMenuItemsByRestaurant(
  restaurantId: string,
): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from("menu_items")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("name");

  if (error) throw new Error(error.message);

  return (data ?? []).map((m) => ({
    id: m.id,
    restaurant: m.restaurant,
    restaurant_id: m.restaurant_id,
    name: m.name,
    category: m.category,
    price: Number(m.price),
    available: Boolean(m.available),
  }));
}

// ---------------------------------------------------------------------------
// Global search (Prompt 3.1)
// ---------------------------------------------------------------------------

export type SearchEntity =
  "order" | "restaurant" | "rider" | "customer" | "menu_item";

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
export async function searchEverything(term: string): Promise<SearchResult[]> {
  const trimmed = term.trim();
  if (trimmed.length < MIN_TERM_LENGTH) return [];

  const [orders, restaurants, riders, customers, menuItems] = await Promise.all(
    [
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
    ],
  );

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
      href: listHref("orders", label),
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
      href: listHref("restaurants", label),
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
      href: listHref("riders", label),
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
      href: listHref("/dashboard/menu", label),
    };
  }
  return {
    entity: "customer",
    id,
    title: text(row.name),
    subtitle: [text(row.email), text(row.phone), text(row.city)]
      .filter(Boolean)
      .join(" · "),
    href: listHref("customers", label),
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

  return requireOk(
    error,
    ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      userId: String(row.user_id),
      email: String(row.email),
      role: row.role === "admin" ? ("admin" as const) : ("merchant" as const),
      restaurantId:
        row.restaurant_id == null ? null : String(row.restaurant_id),
      restaurantName:
        row.restaurant_name == null ? null : String(row.restaurant_name),
      createdAt: String(row.created_at),
    })),
  );
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

export type RiderAccess = {
  riderId: string;
  riderName: string;
  userId: string | null;
  email: string;
  archivedAt: string | null;
};

/** Every rider with its linked auth account, or "(none)" when unlinked. */
export async function fetchRiderAccess(): Promise<RiderAccess[]> {
  const { data, error } = await supabase.rpc("rider_access_list");

  return requireOk(
    error,
    ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      riderId: String(row.rider_id),
      riderName: String(row.rider_name),
      userId: row.user_id == null ? null : String(row.user_id),
      email: String(row.email),
      archivedAt: row.archived_at == null ? null : String(row.archived_at),
    })),
  );
}

/**
 * Attach an existing account to a rider row, or move the link.
 *
 * The rider keeps their row (and therefore their order history and delivery
 * count) when the link moves; only riders.user_id and the app_users role change.
 */
export async function setRiderAccess(
  email: string,
  riderId: string,
): Promise<void> {
  const { error } = await supabase.rpc("set_rider_access", {
    p_email: email,
    p_rider_id: riderId,
  });
  requireOk(error, undefined);
}

/** Remove the rider link. The auth account and the rider row both survive. */
export async function revokeRiderAccess(email: string): Promise<void> {
  const { error } = await supabase.rpc("revoke_rider_access", {
    p_email: email,
  });
  requireOk(error, undefined);
}

export type RiderApplicationStatus = "pending" | "approved" | "rejected";

export type RiderApplication = {
  id: string;
  status: RiderApplicationStatus;
  fullName: string;
  phone: string;
  city: string;
  vehicle: VehicleType;
  licenceRef: string | null;
  orcrRef: string | null;
  governmentIdRef: string | null;
  decisionNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  /**
   * Who reviewed it, as an email. Null while pending; "(deleted account)" if the
   * reviewer's auth row is gone, because the record still stands. Requires
   * migration 0059 -- 0051's version of the RPC did not return this column.
   */
  reviewerEmail: string | null;
  applicantEmail: string;
  applicantUserId: string;
  /**
   * Whole days the application has been waiting, computed in SQL (migration
   * 0051) so the queue's ordering and this number cannot disagree. 0 for
   * reviewed rows, which no longer age.
   */
  waitingDays: number;
};

/**
 * Rider applications for the review queue. Pending first, then most recent --
 * the SQL orders it that way so the page does not re-sort. p_status is passed
 * through unvalidated and matched against the enum's text, so an unknown value
 * returns nothing rather than everything.
 */
export async function fetchRiderApplications(
  status?: RiderApplicationStatus,
): Promise<RiderApplication[]> {
  const { data, error } = await supabase.rpc("fetch_rider_applications", {
    p_status: status,
  });

  return requireOk(
    error,
    ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      status: String(row.status) as RiderApplicationStatus,
      fullName: String(row.full_name),
      phone: String(row.phone),
      city: String(row.city),
      vehicle: String(row.vehicle) as VehicleType,
      licenceRef: row.licence_ref == null ? null : String(row.licence_ref),
      orcrRef: row.orcr_ref == null ? null : String(row.orcr_ref),
      governmentIdRef:
        row.government_id_ref == null ? null : String(row.government_id_ref),
      decisionNote:
        row.decision_note == null ? null : String(row.decision_note),
      createdAt: String(row.created_at),
      reviewedAt: row.reviewed_at == null ? null : String(row.reviewed_at),
      // 0051's RPC has no reviewer_email column, so until 0059 is applied this
      // reads undefined and maps to null -- i.e. "not known", not "nobody".
      reviewerEmail:
        row.reviewer_email == null ? null : String(row.reviewer_email),
      applicantEmail: String(row.applicant_email),
      applicantUserId: String(row.applicant_user_id),
      waitingDays: Number(row.waiting_days ?? 0),
    })),
  );
}

/**
 * Approve or reject an application.
 *
 * On approval the database creates the rider row and links the auth account in
 * the same transaction, and returns the new rider id. That is why this does not
 * then call setRiderAccess(): the SQL already did it, and doing it twice would
 * be a second un-audited link move.
 */
export async function reviewRiderApplication(
  applicationId: string,
  approve: boolean,
  note?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("review_rider_application", {
    p_application_id: applicationId,
    p_approve: approve,
    p_note: note?.trim() ? note.trim() : undefined,
  });
  return requireOk(error, String(data ?? ""));
}

// ---------------------------------------------------------------------------
// Rider operations (migration 0050 / 0051)
//
// Everything below goes through a security-definer RPC rather than a direct
// table read or write. That is not a style preference: the admin UI holds a
// user-scoped Supabase client, and these reads involve auth.users, rider_notes
// and audit_log, none of which any authenticated role can see directly.
// ---------------------------------------------------------------------------

/**
 * The riders list, with everything a row needs in one round trip.
 *
 * Replaces a per-row fetch for current job / failures / week earnings. Flag
 * thresholds are applied by the caller in lib/rider-flags.ts rather than here,
 * so they are not duplicated between SQL and TypeScript.
 */
export async function fetchRiderOverview(): Promise<RiderOverview[]> {
  const { data, error } = await supabase.rpc("admin_rider_overview");

  return requireOk(
    error,
    ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.rider_id),
      name: String(row.name),
      email: String(row.email),
      phone: String(row.phone ?? ""),
      city: String(row.city),
      vehicle: String(row.vehicle) as Rider["vehicle"],
      status: String(row.status) as Rider["status"],
      deliveries: Number(row.deliveries),
      rating: Number(row.rating),
      earnings: Number(row.earnings),
      archivedAt: row.archived_at == null ? null : String(row.archived_at),
      suspendedAt: row.suspended_at == null ? null : String(row.suspended_at),
      suspendedReason:
        row.suspended_reason == null ? null : String(row.suspended_reason),
      userId: row.user_id == null ? null : String(row.user_id),
      currentOrderId: row.current_order_id == null ? null : String(row.current_order_id),
      currentOrderReference:
        row.current_order_reference == null ? null : String(row.current_order_reference),
      currentOrderStatus:
        row.current_order_status == null
          ? null
          : (String(row.current_order_status) as Order["status"]),
      deliveredCount: Number(row.delivered_count ?? 0),
      failedCount: Number(row.failed_count ?? 0),
      weekEarnings: Number(row.week_earnings ?? 0),
      updatedAt: row.updated_at == null ? null : String(row.updated_at),
    })),
  );
}

/**
 * Suspend or reinstate a rider.
 *
 * The database requires a reason to suspend, refuses to let anything but this
 * function change the suspension columns (trigger in 0050), and writes an
 * audit row. The UI's required-reason field is a convenience, not the
 * enforcement.
 */
export async function setRiderSuspended(
  id: string,
  suspended: boolean,
  reason?: string,
): Promise<void> {
  const { error } = await supabase.rpc("admin_set_rider_suspended", {
    p_rider_id: id,
    p_suspended: suspended,
    p_reason: reason?.trim() ? reason.trim() : undefined,
  });
  requireOk(error, undefined);
}

/** Payout amount and delivery count per day, empty days included as zero. */
/**
 * A rider's earnings, summed from the payout ledger.
 *
 * The ledger has RLS on and no authenticated grant (0038, 0039), so an admin
 * looking at *another* rider has no table read at all -- this goes through the
 * admin-gated RPC in migration 0058. Replaces orders.total, which was the
 * customer's bill.
 *
 * Requires 0058 to be applied.
 */
export async function fetchRiderPayoutSummary(
  riderId: string,
): Promise<RiderPayoutSummary> {
  const { data, error } = await supabase.rpc("admin_rider_payout_summary", {
    p_rider_id: riderId,
  });
  if (error) throw new Error(error.message);

  // The function returns exactly one row by construction.
  return mapPayoutSummary((data ?? [])[0] as Record<string, unknown> | undefined);
}

/** One rider's per-delivery payout rows, newest first. Requires migration 0058. */
export async function fetchRiderPayouts(
  riderId: string,
  limit = 25,
): Promise<RiderPayout[]> {
  const { data, error } = await supabase.rpc("admin_rider_payouts", {
    p_rider_id: riderId,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);

  return mapPayouts((data ?? []) as unknown as Record<string, unknown>[]);
}

export async function fetchRiderEarningsByDay(
  riderId: string,
  from: Date,
  to: Date,
): Promise<RiderEarningsDay[]> {
  const { data, error } = await supabase.rpc("admin_rider_earnings_by_day", {
    p_rider_id: riderId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });

  return requireOk(
    error,
    ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      day: String(row.day),
      amount: Number(row.amount ?? 0),
      deliveries: Number(row.deliveries ?? 0),
    })),
  );
}

/** Status changes, suspension, account attach/revoke and note additions. */
export async function fetchRiderActivity(riderId: string): Promise<RiderActivityEvent[]> {
  const { data, error } = await supabase.rpc("admin_rider_activity", {
    p_rider_id: riderId,
  });

  return requireOk(
    error,
    ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: Number(row.id),
      event: String(row.event),
      detail: (row.detail ?? null) as Record<string, unknown> | null,
      actorEmail: row.actor_email == null ? null : String(row.actor_email),
      changedAt: String(row.changed_at),
    })),
  );
}

export async function fetchRiderNotes(riderId: string): Promise<RiderNote[]> {
  const { data, error } = await supabase.rpc("admin_rider_notes", {
    p_rider_id: riderId,
  });

  return requireOk(
    error,
    ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: Number(row.id),
      body: String(row.body),
      authorEmail: row.author_email == null ? null : String(row.author_email),
      createdAt: String(row.created_at),
    })),
  );
}

export async function addRiderNote(riderId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc("admin_add_rider_note", {
    p_rider_id: riderId,
    p_body: body,
  });
  requireOk(error, undefined);
}
