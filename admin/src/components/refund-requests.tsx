"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatShortDate } from "@/lib/format";
import {
  resolveRefundRequest,
  type RefundRequestEntry,
} from "@/lib/supabase/feedback-queries";

type Decision = { row: RefundRequestEntry; approve: boolean };

/**
 * Customers' refund requests waiting for an answer (0159), shown in the
 * Overview's Needs attention card. Approving records the refund; declining
 * needs a note the customer reads. A request is the only way to refund.
 */
export function RefundRequests({
  rows,
  onResolved,
}: {
  rows: RefundRequestEntry[];
  onResolved: () => void;
}) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "gcash">("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (rows.length === 0) return null;

  function open(row: RefundRequestEntry, approve: boolean) {
    setDecision({ row, approve });
    setAmount(row.total.toFixed(2));
    setMethod(row.payment === "cash" ? "cash" : "gcash");
    setNote("");
    setError(null);
  }

  async function submit() {
    if (!decision) return;
    const value = Number(amount);
    if (decision.approve && !(value > 0)) {
      setError("Enter the amount to refund.");
      return;
    }
    if (!decision.approve && !note.trim()) {
      setError("Say why it is declined. The customer sees it.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resolveRefundRequest({
        id: decision.row.id,
        approve: decision.approve,
        amount: decision.approve ? value : undefined,
        method: decision.approve ? method : undefined,
        note: note.trim() || undefined,
      });
      setDecision(null);
      onResolved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Refund requests ({rows.length})
      </p>
      <ul className="divide-y divide-border/70">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-start gap-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-card-foreground">
                  {row.reference} · {row.restaurant} · {formatCurrency(row.total)}
                </p>
                <p className="text-muted-foreground">
                  {row.customer} · {formatShortDate(row.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-card-foreground">
                  “{row.reason}”
                </p>
                {row.photoUrl ? (
                  <a href={row.photoUrl} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                    <img
                      src={row.photoUrl}
                      alt={`Customer's photo for ${row.reference}`}
                      className="mt-2 h-28 w-auto rounded-md border border-border object-cover"
                    />
                  </a>
                ) : null}
              </div>
              <span className="flex gap-2">
                <Button size="sm" onClick={() => open(row, true)}>
                  Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => open(row, false)}>
                  Decline
                </Button>
              </span>
            </li>
          ))}
      </ul>

      <Dialog
        open={decision !== null}
        onClose={busy ? () => {} : () => setDecision(null)}
        title={
          decision?.approve
            ? `Refund ${decision.row.reference}`
            : `Decline ${decision?.row.reference ?? ""}`
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {decision?.approve ? (
            <div className="flex flex-wrap gap-3">
              <Input
                aria-label="Amount to refund in pesos"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-32"
              />
              <Select
                aria-label="Refund method"
                value={method}
                onChange={(e) => setMethod(e.target.value as "cash" | "gcash")}
                className="w-32"
              >
                <option value="cash">Cash</option>
                <option value="gcash">GCash</option>
              </Select>
            </div>
          ) : null}
          <Textarea
            aria-label={decision?.approve ? "Note (optional)" : "Reason for declining"}
            placeholder={
              decision?.approve
                ? "Note for the customer (optional)"
                : "Why it is declined — the customer sees this"
            }
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setDecision(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={decision?.approve ? "primary" : "destructive"}
              disabled={busy}
              loading={busy}
            >
              {decision?.approve ? "Record refund" : "Decline request"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
