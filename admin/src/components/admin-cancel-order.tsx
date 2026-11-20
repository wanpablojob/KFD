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
 * (admin_cancel_order, 0154). Also the stop for an order that looks like a
 * scam: a fake name, an address that does not exist, a prank.
 */

/** Reasons an admin picks most; one tap fills the box, still editable. */
const QUICK_REASONS = [
  "Suspected scam or fake order",
  "Customer cannot be reached",
  "No rider available",
  "Shop is closed",
];

export function canAdminCancel(order: Pick<Order, "status">): boolean {
  return order.status !== "delivered" && order.status !== "cancelled";
}

export function AdminCancelOrder({
  order,
  onCancelled,
  startOpen = false,
  onDismiss,
}: {
  order: Order;
  onCancelled?: () => void;
  /** Open on the reason form (from the order list's Cancel button). */
  startOpen?: boolean;
  /** "Keep order" when the form is all there is, e.g. its own dialog. */
  onDismiss?: () => void;
}) {
  const [open, setOpen] = useState(startOpen);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canAdminCancel(order)) return null;

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
      <div className="flex flex-wrap gap-2" aria-label="Common reasons">
        {QUICK_REASONS.map((r) => (
          <Button
            key={r}
            type="button"
            size="sm"
            variant={reason === r ? "primary" : "outline"}
            disabled={saving}
            onClick={() => {
              setReason(r);
              setError(null);
            }}
          >
            {r}
          </Button>
        ))}
      </div>
      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why it is being cancelled. The customer and the shop see this."
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
          onClick={() => (onDismiss ? onDismiss() : setOpen(false))}
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
