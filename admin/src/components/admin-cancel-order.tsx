"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { adminCancelOrder } from "@/lib/supabase/queries";
import { notifyOrder } from "@/lib/merchant-notify";
import type { Order } from "@/lib/types";

/**
 * The admin's way out for an order that is stuck: no rider for hours, a shop
 * that closed, a customer who cannot be reached. Any order that is not
 * delivered or already cancelled can be cancelled here, with a reason
 * (admin_cancel_order, 0154).
 */
export function AdminCancelOrder({
  order,
  onCancelled,
}: {
  order: Order;
  onCancelled?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (order.status === "delivered" || order.status === "cancelled") return null;

  // Once a rider has it, they may already have paid the shop for the food at
  // pickup (0147); that money has to be settled with them by hand.
  const riderInvolved =
    Boolean(order.rider) || order.status === "out_for_delivery";

  async function confirm() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("Give a reason. The customer and the shop see it.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await adminCancelOrder(order.id, trimmed);
      // The customer hears about it the same way as a shop cancellation. A
      // failed message does not undo the cancellation.
      const notice = await notifyOrder(order.id, "status_changed", trimmed);
      if (!notice.ok)
        setError(
          `Cancelled, but the customer was not notified: ${notice.detail}`,
        );
      setOpen(false);
      setReason("");
      onCancelled?.();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not cancel the order.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="border-t border-border pt-4">
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Cancel order
        </Button>
        {error ? (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm font-semibold text-card-foreground">
        Cancel {order.reference}?
      </p>
      {riderInvolved ? (
        <p className="text-sm text-muted-foreground">
          A rider has this order{order.rider ? ` (${order.rider})` : ""}. If
          they already collected it, they paid the shop for the food. Settle
          that with them.
        </p>
      ) : null}
      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why it is being cancelled, e.g. no rider available, shop closed"
        aria-label="Reason for cancelling"
        rows={3}
        disabled={saving}
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          disabled={saving}
          onClick={() => setOpen(false)}
        >
          Keep order
        </Button>
        <Button
          variant="destructive"
          disabled={saving}
          onClick={() => void confirm()}
        >
          {saving ? "Cancelling…" : "Yes, cancel order"}
        </Button>
      </div>
    </div>
  );
}
