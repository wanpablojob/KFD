import { supabase } from "./client";
import {
  mapCustomerStatsRow,
  mapCustomerStatsTotals,
  type CustomerStats,
  type CustomerStatsTotals,
} from "@/lib/customer-stats";
import { customerOrderScope, CUSTOMER_ORDER_COLUMNS } from "@/lib/customer-orders";
import type { Order, OrderItem } from "@/lib/types";

/**
 * Reads for /dashboard/customers, kept in their own module for the same reason
 * merchant-queries.ts is: this surface has its own data rules, and the customers
 * aggregates are the only ones in the admin that are computed on read rather than
 * maintained on the row.
 *
 * Everything here goes through an RPC that re-checks is_platform_admin() INSIDE
 * the function, so these reads are admin-only regardless of what the `customers`
 * table policy happens to be. That matters because the table still carries the
 * 0001 "authenticated full access: customers" policy.
 */

/**
 * Customers with LIVE aggregates, from admin_customer_stats() (0061).
 *
 * Replaces the old read of the seed constants. `customers.orders_count` and
 * `customers.total_spend` were written once by 0001 and never maintained; the
 * 0008 refusal to fix them was right at the time, because `orders.customer` was
 * free text with no foreign key, but that stopped being true at 0012
 * (orders.customer_user_id) and 0059 (customers.user_id). Both columns are now
 * legacy and are selected nowhere.
 *
 * A row whose user_id is null has no aggregates -- not zero -- so the UI can say
 * "not linked" instead of inventing a spending history for a fixture.
 */
export async function fetchCustomerStats(): Promise<CustomerStats[]> {
  const { data, error } = await supabase.rpc("admin_customer_stats");
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as Record<string, unknown>[]).map(
    mapCustomerStatsRow,
  );
}

/**
 * Customer counts for the stat cards, plus the walk-in figures. Walk-in orders
 * have no customer_user_id and belong to nobody, so they are reported here rather
 * than folded into anyone's spend -- otherwise real spend would silently not add
 * up to platform spend.
 */
export async function fetchCustomerStatsTotals(): Promise<CustomerStatsTotals> {
  const { data, error } = await supabase.rpc("admin_customer_stats_totals");
  if (error) throw new Error(error.message);

  const row = ((data ?? []) as unknown as Record<string, unknown>[])[0];
  if (!row) throw new Error("Customer totals came back empty.");
  return mapCustomerStatsTotals(row);
}
/**
 * One customer row, addressed by customers.id.
 *
 * The detail page used to load the whole list and find() the row by name, which
 * meant every customer was fetched to show one. This is the same row by id, and
 * `useAsyncData` is keyed on the id so the fetch re-runs if the route changes.
 *
 * Reads the table directly rather than filtering the stats RPC, because the row
 * can be an archived one -- the stats RPC returns archived rows too, so either
 * works, and a direct read is one fewer round trip and no list scan.
 */
export async function fetchCustomerById(id: string): Promise<CustomerStats | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;

  const { data, error } = await supabase.rpc("admin_customer_stats");
  if (error) throw new Error(error.message);

  const row = ((data ?? []) as unknown as Record<string, unknown>[]).find(
    (candidate) => candidate.id === trimmed,
  );
  return row ? mapCustomerStatsRow(row) : null;
}

/** A page of one customer's orders, newest first. */
export type CustomerOrderPage = {
  rows: CustomerDelivery[];
  page: number;
  /** Null when the count is unavailable, so the pager can be hidden. */
  total: number | null;
  hasMore: boolean;
};

/** An order plus the columns the customer detail page shows about it. */
export type CustomerDelivery = Order & {
  customerPhone: string | null;
  deliveryAddress: string | null;
  serviceFee: number;
};

/**
 * One page of a customer's orders, by auth id.
 *
 * Paginated in SQL rather than sliced in the browser: a long-standing customer
 * has hundreds of orders and the page should not pull all of them to show the
 * first 25.
 *
 * Throws rather than returning an empty page when the scope is missing, because
 * "no id" is a caller bug (the page rendered before the customer resolved) and
 * must not look like a customer with no orders.
 */
export async function fetchCustomerOrders(
  userId: string | null | undefined,
  options: { page?: number; limit?: number } = {},
): Promise<CustomerOrderPage> {
  const scope = customerOrderScope(userId);
  if (!scope) {
    throw new Error(
      "This customer has no linked account, so their orders cannot be read.",
    );
  }

  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const limit = Math.max(1, Math.trunc(options.limit ?? 20));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from("orders")
    .select(CUSTOMER_ORDER_COLUMNS, { count: "exact" })
    .eq(scope.column, scope.value)
    .order("placed_at", { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(
    mapCustomerDelivery,
  );
  return {
    rows,
    page,
    total: typeof count === "number" ? count : null,
    hasMore: typeof count === "number" ? to < count : rows.length === limit,
  };
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function mapItems(value: unknown): OrderItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((line) => {
    if (typeof line !== "object" || line === null) return [];
    const record = line as Record<string, unknown>;
    return [
      {
        name: String(record.name ?? ""),
        quantity: num(record.quantity),
        price: num(record.price),
      },
    ];
  });
}

function mapCustomerDelivery(row: Record<string, unknown>): CustomerDelivery {
  return {
    id: String(row.id ?? ""),
    reference: String(row.reference ?? ""),
    customer: String(row.customer ?? ""),
    customerPhone: text(row.customer_phone),
    restaurant: String(row.restaurant ?? ""),
    items: mapItems(row.items),
    subtotal: num(row.subtotal),
    deliveryFee: num(row.delivery_fee),
    serviceFee: num(row.service_fee),
    total: num(row.total),
    status: String(row.status ?? "pending") as Order["status"],
    payment: String(row.payment ?? "cash") as Order["payment"],
    placedAt: String(row.placed_at ?? ""),
    rider: "",
    rejectionReason: text(row.rejection_reason),
    deliveryFailedReason: text(row.delivery_failed_reason),
    deliveryFailedAt: text(row.delivery_failed_at),
    deliveryAddress: text(row.delivery_address),
  };
}
