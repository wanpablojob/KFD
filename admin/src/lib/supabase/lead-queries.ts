import { supabase } from "./client";
import type { Database } from "./database.types";

/**
 * Website sign-ups (0032): the waitlist and restaurant and rider interest from
 * the landing page. The table has no policies, so the read goes through an
 * admin-only RPC (0111).
 */
export type Lead = Database["public"]["Tables"]["leads"]["Row"];

export async function fetchLeads(): Promise<Lead[]> {
  const { data, error } = await supabase.rpc("admin_list_leads");
  if (error) throw new Error(error.message);
  return data ?? [];
}
