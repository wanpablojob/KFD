"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Suspend / reinstate.
 *
 * The reason field is required here *and* in the database. That is deliberate
 * duplication: the UI check gives an instant answer without a round trip, and
 * the SQL check is the one that actually holds, because it also fires when the
 * RPC is called directly.
 */
export function SuspendRiderDialog({
  riderName,
  suspending,
  busy,
  onClose,
  onConfirm,
}: {
  riderName: string;
  /** true = suspend, false = reinstate. */
  suspending: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const tooShort = suspending && trimmed.length === 0;

  return (
    <Dialog
      open
      onClose={busy ? () => {} : onClose}
      title={suspending ? `Suspend ${riderName}?` : `Reinstate ${riderName}?`}
    >
      <div className="space-y-4">
        {suspending ? (
          <>
            <p className="text-sm text-muted-foreground">
              Dispatch will stop offering {riderName} any deliveries, and any offer
              they already hold can no longer be claimed. Their rider record,
              delivery history, rating and earnings are all kept.
            </p>
            <p className="text-sm text-muted-foreground">
              This is separate from archiving, which hides a rider permanently.
              Reinstate them at any time with one tap.
            </p>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-card-foreground">
                Reason (required)
              </span>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                placeholder="Licence expired, pending renewal"
                aria-required="true"
                aria-invalid={tooShort}
                className="w-full"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Shown to admins on the rider list. The rider is not shown it.
              </span>
            </label>
          </>
        ) : (
            <p className="text-sm text-muted-foreground">
              {riderName} will be offered deliveries again as soon as they are
              online. The suspension reason is cleared, but it stays in the
              rider&apos;s activity history.
            </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={suspending ? "destructive" : "primary"}
            onClick={() => void onConfirm(trimmed)}
            disabled={busy || tooShort}
          >
            {busy
              ? "Saving…"
              : suspending
                ? "Suspend rider"
                : "Reinstate rider"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}