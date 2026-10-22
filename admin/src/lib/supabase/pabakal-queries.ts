import { supabase } from "./client";
import type { Database } from "./database.types";

/** Pabakal requests (0120): admins read every row through RLS. */
export type Pabakal = Database["public"]["Tables"]["pabakal_requests"]["Row"];

export async function fetchPabakal(): Promise<Pabakal[]> {
  const { data, error } = await supabase
    .from("pabakal_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function cancelPabakal(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("admin_cancel_pabakal", { p_id: id, p_reason: reason });
  if (error) throw new Error(error.message);
}
