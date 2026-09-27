"use client";

import { useState } from "react";
import {
  allowedTransitions,
  setOrderStatus,
  type MerchantOrderStatus,
} from "@/lib/supabase/merchant-queries";
import { notifyOrder } from "@/lib/merchant-notify";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

const LABELS: Record<MerchantOrderStatus, string> = {
  pending: "Pending",
  confirmed: "Accept",
  preparing: "Start preparing",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Reject",
};

const VARIANTS: Record<MerchantOrderStatus, "primary" | "outline" | "destructive"> = {
  pending: "outline",
  confirmed: "primary",
  preparing: "primary",
  out_for_delivery: "primary",
  delivered: "primary",
  cancelled: "destructive",
};

const HELP: Record<MerchantOrderStatus, string> = {
  pending: "Awaiting your decision",
  confirmed: "You accepted this order",
  preparing: "Kitchen is working on it",
  out_for_delivery: "Courier has it",
  delivered: "Completed",
  cancelled: "You rejected this order",
};

/**
 * Accept / reject controls for a single order.
 *
 * Rejecting opens a dialog asking for a reason. The reason is not persisted
 * (orders has no column for it) but is shown to the customer in the email, so
 * a rejected order is never unexplained. That is the whole reason the dialog
 * exists rather than a bare button.
 */
export function OrderActions({
  orderId,
  status,
  onChanged,
  compact = false,
}: {
  orderId: string;
  status: MerchantOrderStatus;
  onChanged: () => void;
  compact?: boolean;
}) {
  const [pending, setPending] = useState<MerchantOrderStatus | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const next = allowedTransitions(status);
  if (next.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {status === "cancelled" ? "Rejected" : "No further action"}
      </p>
    );
  }

  async function apply(target: MerchantOrderStatus) {
    setError(null);
    setPending(target);
    try {
      await setOrderStatus(orderId, target);

      // The customer is emailed after the status is durably saved. A failed
      // email is reported but does not roll the status back.
      const rejection = target === "cancelled" ? reason.trim() : undefined;
      const notice = await notifyOrder(orderId, "status_changed", rejection);
      if (!notice.ok) {
        setError(`Saved, but the customer email failed: ${notice.detail}`);
      }

      setConfirmReject(false);
      setReason("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update order.");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <div className={compact ? "flex items-center gap-2" : "space-y-2"}>
        {next.map((target) =>
          target === "cancelled" ? (
            <Button
              key={target}
              size="sm"
              variant="destructive"
              disabled={pending !== null}
              onClick={() => setConfirmReject(true)}
            >
              {LABELS[target]}
            </Button>
          ) : (
            <Button
              key={target}
              size="sm"
              variant={VARIANTS[target]}
              disabled={pending !== null}
              onClick={() => apply(target)}
            >
              {pending === target ? "Saving…" : LABELS[target]}
            </Button>
          ),
        )}
        <p className="text-xs text-muted-foreground">{HELP[status]}</p>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>

      <Dialog
        open={confirmReject}
        onClose={() => setConfirmReject(false)}
        title="Reject this order?"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The customer is emailed right away. Give a reason so the rejection
            is not unexplained.
          </p>
          <div>
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Kitchen is too busy, item unavailable…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmReject(false)}
              disabled={pending !== null}
            >
              Keep order
            </Button>
            <Button
              variant="destructive"
              onClick={() => apply("cancelled")}
              disabled={pending !== null}
            >
              {pending === "cancelled" ? "Rejecting…" : "Reject order"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
