import { supabase } from "./client";

/**
 * The current platform-wide commission rate (0138), for the Reports page.
 *
 * The pay-the-shop screens are gone: the rider pays the shop for the food at
 * pickup (0147), so KFD never holds a shop's money. Read through the RPC, not
 * the table: `platform_settings` is revoked from `authenticated` and only
 * reachable by a SECURITY DEFINER function.
 */
export async function fetchCommission(): Promise<number> {
  const { data, error } = await supabase.rpc("admin_commission");
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
