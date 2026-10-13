"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import { reviewWindowRemaining } from "@/lib/rider-ledger";

/**
 * Resolve a disputed payout (migration 0075).
 *
 * The dispute lifecycle existed only in the database: a customer or merchant
 * could raise one, the mobile app could raise one, the rider's payout row turned
 * "Disputed" and stopped counting as settled -- and the admin console had no
 * control to act on it. The badge was the end of the road. This is the decision
 * the 24-hour window was built to wait for.
 *
 * The two outcomes are not symmetric, so they are not two shades of one button:
 * release pays the rider and is the default; reverse takes the money back and
 * rewrites their delivery and earnings totals. Reverse is destructive and says
 * what it does.
 */
export function ResolveDisputeDialog({
  reference,
  riderName,
  amount,
  reason,
  reviewExpiresAt,
  busy,
  onClose,
  onResolve,
}: {
  reference: string;
  riderName: string;
  amount: number;
  /** The customer's or merchant's own words. Null if none was left. */
  reason: string | null;
  reviewExpiresAt: string | null;
  busy: boolean;
  onClose: () => void;
  onResolve: (action: "release" | "reverse", note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  // Release is the safe default, so Enter/the primary button does the reversible
  // thing and reverse takes a deliberate, separate click.
  const [pending, setPending] = useState<"release" | "reverse" | null>(null);

  const remaining = reviewWindowRemaining(reviewExpiresAt);

  async function decide(action: "release" | "reverse") {
    setPending(action);
    try {
      await onResolve(action, note.trim());
    } finally {
      setPending(null);
    }
  }

  const working = busy || pending !== null;

  return (
    <Dialog
      open
      onClose={working ? () => {} : onClose}
      title={`Resolve dispute on ${reference}`}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <p className="font-medium text-card-foreground">
            {formatCurrency(amount)} to {riderName}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {remaining
              ? `The review window closes in ${remaining.replace(" left", "")}. After that the payout settles automatically.`
              : "This delivery was reported as a problem and its payout is being held until you decide."}
          </p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            What was reported
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-card-foreground">
            {reason ?? "No reason was recorded."}
          </p>
        </div>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-card-foreground">
            Note (optional)
          </span>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder="Called the customer; delivery confirmed, releasing."
            className="w-full"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Kept with the payout next to the customer&apos;s own words, for the
            audit trail.
          </span>
        </label>

        <p className="text-xs text-muted-foreground">
          Releasing pays the rider what is held here. Reversing takes it back and
          subtracts the delivery from their totals.
        </p>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={working}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void decide("reverse")}
            disabled={working}
          >
            {pending === "reverse" ? "Reversing…" : "Reverse payout"}
          </Button>
          <Button
            onClick={() => void decide("release")}
            disabled={working}
          >
            {pending === "release" ? "Releasing…" : "Release to rider"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
