"use client";

import { supabase } from "./supabase/client";

/**
 * Ask the server to email the customer about a status change.
 *
 * Best-effort by design: the order status is already saved by the time this
 * runs, and a failed email must not surface as a failed accept/reject. The
 * outcome is logged rather than thrown.
 */
export async function notifyOrder(
  orderId: string,
  event: "placed" | "status_changed",
  reason?: string
): Promise<{ ok: boolean; detail: string }> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    const res = await fetch("/api/orders/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ orderId, event, reason }),
    });

    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, detail: JSON.stringify(body) };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "Notification failed",
    };
  }
}
