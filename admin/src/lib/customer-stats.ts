/**
 * Customer rows with live aggregates: the pure half of the read.
 *
 * The fetch lives in supabase/queries.ts, which keeps the real generated types;
 * the scope and the row mapping live here so both are testable without a
 * Supabase client. Same split as lib/rider-orders.ts.
 *
 * Two things this file exists to get right:
 *
 *   * An UNLINKED row is not a customer with zero orders. `user_id` is null for
 *     a 0001 seed row that has no auth account, and its aggregates come back
 *     NULL. Collapsing that to 0 would render "₱0.00 total, Standard tier" for a
 *     fixture, which is a claim about a person's spending that nobody made. So
 *     `linked` is carried through and the aggregates stay null.
 *
 *   * The numbers are never recomputed here. avg order value in particular is a
 *     division the SQL already did; doing it again in TypeScript would be a
 *     second implementation to keep in step with the first.
 */

export type CustomerStats = {
  /** customers.id -- the admin-facing row key, stable and never the auth id. */
  id: string;
  /** auth id, or null when the row was never linked to an account. */
  userId: string | null;
  name: string;
  email: string;
  phone: string;
  city: string;
  joinedAt: string;
  archivedAt: string | null;
  blockedAt: string | null;
  notes: string | null;
  linked: boolean;
  ordersCount: number;
  deliveredCount: number;
  cancelledCount: number;
  /** Deliveries a rider reported as impossible (0044), not a status. */
  failedCount: number;
  /** Null for an unlinked row. */
  totalSpend: number | null;
  avgOrderValue: number | null;
  lastOrderAt: string | null;
};

export type CustomerStatsTotals = {
  totalCustomers: number;
  newThisMonth: number;
  activeThisMonth: number;
  /** Orders with no customer account. Counted here, attributed to nobody. */
  walkInOrders: number;
  walkInSpend: number;
};

function str(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function nullableStr(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapCustomerStatsRow(row: Record<string, unknown>): CustomerStats {
  const userId = nullableStr(row.user_id);
  return {
    id: str(row.id),
    userId,
    name: str(row.name),
    email: str(row.email),
    phone: str(row.phone),
    city: str(row.city),
    joinedAt: str(row.joined_at),
    archivedAt: nullableStr(row.archived_at),
    blockedAt: nullableStr(row.blocked_at),
    notes: nullableStr(row.notes),
    linked: userId !== null,
    // Counts are 0 for a linked customer who has not ordered: that is a real
    // zero. An unlinked row still gets 0 here because the UI hides the column
    // behind `linked`, and a null there would leak a type hole into every sum.
    ordersCount: num(row.orders_count),
    deliveredCount: num(row.delivered_count),
    cancelledCount: num(row.cancelled_count),
    failedCount: num(row.failed_count),
    totalSpend: nullableNum(row.total_spend),
    avgOrderValue: nullableNum(row.avg_order_value),
    lastOrderAt: nullableStr(row.last_order_at),
  };
}

export function mapCustomerStatsTotals(
  row: Record<string, unknown>,
): CustomerStatsTotals {
  return {
    totalCustomers: num(row.total_customers),
    newThisMonth: num(row.new_this_month),
    activeThisMonth: num(row.active_this_month),
    walkInOrders: num(row.walk_in_orders),
    walkInSpend: num(row.walk_in_spend),
  };
}