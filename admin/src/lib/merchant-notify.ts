"use client";

import { supabase } from "./supabase/client";

/**
 * Ask the server to email the customer about a status change.
 *
 * Best-effort by design: the order status is already saved by the time this
 * runs, and a failed email must not surface as a failed accept/reject. The
 * outcome is logged rather than thrown.
 *
 * The returned `detail` is a sentence safe to render in the merchant UI. The
 * raw response body never leaves this module -- it is logged to the console
 * for the operator and replaced with a human-readable message here. A merchant
 * can act on the message but not on a JSON blob, and a response body can carry
 * provider names or configuration detail that has no business in a browser.
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

    if (!res.ok) {
      // Operator-facing. The body is read for the log only, never rendered.
      const body = await res.text().catch(() => "");
      console.error("[notify] email delivery failed", {
        orderId,
        event,
        status: res.status,
        body: body.slice(0, 500),
      });
      return { ok: false, detail: messageFor(res.status) };
    }

    return { ok: true, detail: "Email sent." };
  } catch (err) {
    console.error("[notify] request threw", {
      orderId,
      event,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      detail:
        "Order saved, but we could not reach the email service. Ask an administrator to check the email settings.",
    };
  }
}

/**
 * Different failures need different words, because they need different people
 * to act. Credentials problems and rate limits are operator configuration;
 * anything else is more likely a transient server fault.
 */
function messageFor(status: number): string {
  if (status === 401 || status === 403) {
    return "Order saved, but the customer was not emailed because email is not set up correctly. Ask an administrator to check the email settings.";
  }
  if (status === 429) {
    return "Order saved, but too many emails were sent just now, so the customer was not notified. Try again in a few minutes.";
  }
  if (status >= 500) {
    return "Order saved, but the email service had a problem, so the customer was not notified. Ask an administrator to check the email settings.";
  }
  return "Order saved, but the customer was not emailed. Ask an administrator to check the email settings.";
}
