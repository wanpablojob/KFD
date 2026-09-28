"use client";

import { supabase } from "./supabase/client";
import {
  classifyNotifyStatus,
  notifyTransportFailure,
  type NotifyFailureCode,
} from "./notify-errors";

export interface NotifyResult {
  ok: boolean;
  detail: string;
  /** Absent on success. Lets callers branch instead of matching on prose. */
  code?: NotifyFailureCode;
  /** Whether a later attempt could plausibly succeed. */
  retryable?: boolean;
}

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
 *
 * Failures also come back as a `code` and a `retryable` flag so the UI can
 * distinguish a permission problem from a rate limit from a dead network
 * instead of pattern-matching on the sentence.
 */
export async function notifyOrder(
  orderId: string,
  event: "placed" | "status_changed",
  reason?: string
): Promise<NotifyResult> {
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
      return { ok: false, ...classifyNotifyStatus(res.status) };
    }

    return { ok: true, detail: "Email sent." };
  } catch (err) {
    console.error("[notify] request threw", {
      orderId,
      event,
      error: err instanceof Error ? err.message : String(err),
    });
    const failure = notifyTransportFailure();
    return { ok: false, ...failure };
  }
}
