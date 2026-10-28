import { supabase } from "./client";

/**
 * What KFD owes a shop, and paying it (0138). Owed = food of delivered, unpaid
 * orders, less refunds (capped at the food), less the platform commission.
 */
export interface Owed {
  orderCount: number;
  foodTotal: number;
  refunds: number;
  commissionPct: number;
  commission: number;
  net: number;
  lastPaidAt: string | null;
}

export async function fetchRestaurantOwed(restaurantId: string): Promise<Owed> {
  const { data, error } = await supabase.rpc("admin_restaurant_owed", {
    p_restaurant_id: restaurantId,
  });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return {
    orderCount: Number(row?.order_count ?? 0),
    foodTotal: Number(row?.food_total ?? 0),
    refunds: Number(row?.refunds ?? 0),
    commissionPct: Number(row?.commission_pct ?? 0),
    commission: Number(row?.commission ?? 0),
    net: Number(row?.net ?? 0),
    lastPaidAt: row?.last_paid_at ?? null,
  };
}

export async function payRestaurant(
  restaurantId: string,
  method: "gcash" | "cash",
  reference?: string,
): Promise<void> {
  const { error } = await supabase.rpc("admin_pay_restaurant", {
    p_restaurant_id: restaurantId,
    p_method: method,
    p_reference: reference?.trim() ? reference.trim() : undefined,
  });
  if (error) throw new Error(error.message);
}

/** KFD's cut of every shop's food sales, 0-50%. Applies to payments from now on. */
export async function setCommission(pct: number): Promise<void> {
  const { error } = await supabase.rpc("admin_set_commission", { p_pct: pct });
  if (error) throw new Error(error.message);
}

/**
 * The current platform-wide rate (0138).
 *
 * Read through the RPC, not the table: `platform_settings` is revoked from
 * `authenticated` and only reachable by a SECURITY DEFINER function, which is
 * also what keeps the Reports page and the settlement screen on one number.
 */
export async function fetchCommission(): Promise<number> {
  const { data, error } = await supabase.rpc("admin_commission");
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
