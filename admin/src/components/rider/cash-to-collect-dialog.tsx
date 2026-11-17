"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { cashOnHandTotal } from "@/lib/rider-cash";
import { useAsyncData } from "@/lib/use-async-data";
import {
  fetchRiderCashOrders,
  recordCashHandover,
} from "@/lib/supabase/queries";
import type { RiderCashPosition } from "@/lib/types";

/**
 * Who owes KFD cash, for which deliveries, and the button to mark it handed in.
 *
 * A rider owes KFD 20.00 per cash delivery (0151): of the 50.00 in fees they
 * keep 25.00 and the 5.00 service fee is the royalty. Each rider's block lists
 * the deliveries behind their balance; "Collected" records the whole balance as
 * one handover, the same record the rider's page shows.
 */
export function CashToCollectDialog({
  open,
  rows,
  filterActive = false,
  onClose,
  onToggleFilter,
  onCollected,
}: {
  open: boolean;
  /** Riders holding cash, already filtered and sorted by ridersHoldingCash(). */
  rows: RiderCashPosition[];
  /** True when the rider list below is already narrowed to these riders. */
  filterActive?: boolean;
  onClose: () => void;
  /** Optional: narrow (or widen) the rider list to these riders. */
  onToggleFilter?: () => void;
  /** After a handover is recorded, so the page can refetch the balances. */
  onCollected?: () => Promise<void> | void;
}) {
  const total = cashOnHandTotal(rows);
  // Refetched whenever the dialog opens, so the list matches the balances.
  const orders = useAsyncData(
    () => (open ? fetchRiderCashOrders() : Promise.resolve([])),
    open ? 1 : 0,
  );
  const [confirming, setConfirming] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function collect(row: RiderCashPosition) {
    setSaving(row.riderId);
    setError(null);
    try {
      await recordCashHandover(
        row.riderId,
        row.onHand,
        `Collected ${formatCurrency(row.onHand)} for the shift`,
      );
      setConfirming(null);
      await Promise.all([orders.refetch(), onCollected?.()]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not record the handover.",
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Cash to collect">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? "No rider owes KFD cash right now."
            : `${rows.length === 1 ? "One rider owes" : `${rows.length} riders owe`} ${formatCurrency(total)}: ₱20 for each delivery. Riders keep ₱25 of the fees; the ₱5 service fee is the royalty.`}
        </p>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {rows.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => {
              const mine = (orders.data ?? []).filter(
                (o) => o.riderId === row.riderId,
              );
              const isConfirming = confirming === row.riderId;
              const isSaving = saving === row.riderId;
              return (
                <li
                  key={row.riderId}
                  className="rounded-lg border border-border"
                >
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <Link
                      href={`/dashboard/riders/${row.riderId}`}
                      className="truncate text-sm font-medium text-card-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {row.riderName}
                    </Link>
                    <span className="shrink-0 text-sm font-semibold text-card-foreground">
                      {formatCurrency(row.onHand)}
                    </span>
                  </div>

                  {orders.loading ? (
                    <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      Loading deliveries…
                    </p>
                  ) : mine.length > 0 ? (
                    <ul className="divide-y divide-border border-t border-border">
                      {mine.map((order) => (
                        <li
                          key={`${order.reference}-${order.collectedAt}`}
                          className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs"
                        >
                          <span className="text-card-foreground">
                            {order.reference}
                          </span>
                          <span className="text-muted-foreground">
                            {formatShortDate(order.collectedAt)}
                          </span>
                          <span className="w-14 text-right tabular-nums text-card-foreground">
                            {formatCurrency(order.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-3 py-2">
                    {isConfirming ? (
                      <>
                        <span className="mr-auto text-xs text-muted-foreground">
                          Did {row.riderName} hand you{" "}
                          {formatCurrency(row.onHand)}?
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isSaving}
                          onClick={() => setConfirming(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          disabled={isSaving}
                          onClick={() => void collect(row)}
                        >
                          {isSaving ? "Saving…" : "Yes, collected"}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        disabled={saving !== null}
                        onClick={() => setConfirming(row.riderId)}
                      >
                        Mark {formatCurrency(row.onHand)} collected
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {onToggleFilter ? (
            <Button
              variant="outline"
              onClick={onToggleFilter}
              disabled={rows.length === 0}
            >
              {filterActive ? "Show all riders" : "Show only these riders"}
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
