import { supabase } from "./client";
import type { AdminNoticeKind } from "@/lib/admin-notice";

/**
 * Tell the person an admin decision was about (/api/admin/notify). Fire and
 * forget: the decision is already saved, so this never throws.
 */
export async function notifyAdminDecision(kind: AdminNoticeKind, id: string | number): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch("/api/admin/notify", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id }),
    });
  } catch {
    // courtesy only
  }
}
