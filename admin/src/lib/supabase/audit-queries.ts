import { supabase } from "./client";
import type { Database } from "./database.types";

/** One audit log entry with emails resolved (0141). */
export type AuditEntry =
  Database["public"]["Functions"]["admin_audit_log"]["Returns"][number];

/** 100 entries, newest first; pass the last id seen to page further back. */
export async function fetchAuditLog(before?: number): Promise<AuditEntry[]> {
  const { data, error } = await supabase.rpc("admin_audit_log", {
    p_limit: 100,
    p_before: before,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}
