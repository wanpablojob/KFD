"use client";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Deleting a login cannot be undone, so the copy says exactly what goes and what stays. */
export function CloseRiderAccountDialog({
  riderName,
  busy,
  onClose,
  onConfirm,
}: {
  riderName: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <Dialog open onClose={busy ? () => {} : onClose} title="Close this rider's account?">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {riderName} asked in the app for their account to be deleted. Their
          sign-in, name, phone, email and GCash details are removed and the
          rider is archived. This cannot be undone.
        </p>
        <p className="text-sm text-muted-foreground">
          Their deliveries, payouts and cash records stay for the books. Pay
          what they are owed before closing: nothing here sends money.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? "Closing…" : "Close account"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
