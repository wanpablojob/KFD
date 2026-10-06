"use client";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Not an EntityDialog: revoking is destructive, so it needs copy that says what
 * survives. EntityDialog has no description slot.
 */
export function RevokeRiderDialog({
  email,
  riderName,
  busy,
  onClose,
  onConfirm,
}: {
  email: string;
  riderName: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <Dialog
      open
      onClose={busy ? () => {} : onClose}
      title="Revoke rider access?"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {email} will immediately lose access to the rider app. {riderName}{" "}
          keeps their rider row, so their delivery count, rating and earnings
          are untouched.
        </p>
        <p className="text-sm text-muted-foreground">
          The sign-in itself is not deleted, so this can be undone by attaching
          the account again.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? "Revoking…" : "Revoke access"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
