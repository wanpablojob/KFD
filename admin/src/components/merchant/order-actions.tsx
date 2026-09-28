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
import { cn } from "@/lib/utils";

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

/** Matches the server-side cap in /api/orders/notify so UI and API agree. */
const REASON_MAX = 280;

/**
 * Accept / reject controls for a single order.
 *
 * Rejecting opens a dialog that requires a reason, because the reason is what
 * the customer sees in the email. The dialog text promises a rejection is
 * never unexplained, so an empty reason must not be sendable -- `reason.trim()`
 * is falsy when blank, which previously produced an unexplained rejection.
 *
 * The reason is now persisted to `orders.rejection_reason` in the same UPDATE
 * that changes the status (Prompt 2.5), so an administrator reviewing a
 * disputed order can see what the restaurant actually said. Before that it
 * existed only in the email and was lost.
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

    // Enforced here as well as on the button. A disabled button is a UI
    // affordance, not a guarantee: this function is reachable from other call
    // sites later, and an empty string is falsy, so the previous code happily
    // emailed a rejection with no explanation.
    const trimmed = reason.trim();
    if (target === "cancelled" && !trimmed) {
      setError("Add a reason before rejecting this order.");
      return;
    }

    setPending(target);
    try {
      // One statement: status and reason together, so a failure cannot leave a
      // changed status with a lost explanation.
      await setOrderStatus(
        orderId,
        target,
        target === "cancelled" ? trimmed : undefined,
      );

      // The customer is emailed after the status is durably saved. A failed
      // email is reported but does not roll the status back.
      const notice = await notifyOrder(
        orderId,
        "status_changed",
        target === "cancelled" ? trimmed : undefined,
      );
      if (!notice.ok) {
        setError(notice.detail);
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

  function openReject() {
    setError(null);
    setReason("");
    setConfirmReject(true);
  }

  function closeReject() {
    setError(null);
    setReason("");
    setConfirmReject(false);
  }

  const reasonLength = reason.trim().length;
  const canReject = reasonLength > 0 && pending === null;

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
              onClick={openReject}
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

      <Dialog open={confirmReject} onClose={closeReject} title="Reject this order?">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The customer is emailed right away. Give a reason so the rejection
            is not unexplained.
          </p>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="reject-reason">Reason</Label>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  reason.length > REASON_MAX
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {reason.length}/{REASON_MAX}
              </span>
            </div>
            <Textarea
              id="reject-reason"
              rows={3}
              value={reason}
              maxLength={REASON_MAX}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Kitchen is too busy, item unavailable…"
              aria-describedby="reject-reason-help"
            />
            {/* A bare disabled button with no explanation is its own UX
                failure, so say what is missing and why. */}
            <p
              id="reject-reason-help"
              className="mt-1.5 text-xs text-muted-foreground"
              aria-live="polite"
            >
              {reasonLength === 0
                ? "Add a reason to continue. The customer sees this."
                : "The customer will see this reason in their email."}
            </p>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={closeReject}
              disabled={pending !== null}
            >
              Keep order
            </Button>
            <Button
              variant="destructive"
              onClick={() => apply("cancelled")}
              disabled={!canReject}
            >
              {pending === "cancelled" ? "Rejecting…" : "Reject order"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
