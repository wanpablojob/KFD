import { supabase } from "./client";
import {
  mapCustomerStatsRow,
  mapCustomerStatsTotals,
  type CustomerStats,
  type CustomerStatsTotals,
} from "@/lib/customer-stats";

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