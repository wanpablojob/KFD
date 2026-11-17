"use client";

import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cashOnHandTotal } from "@/lib/rider-cash";
import type { RiderCashPosition } from "@/lib/types";

/**
 * Who owes cash, and how much.
 *
 * The summary card above only carries a count and a total; this is the list a
 * shift lead actually acts on. It reads the same admin_rider_cash() rows the
 * card counted -- no extra request -- and each rider links to the page that
 * has the "Record cash handover" action.
 */
export function CashToCollectDialog({
  open,
  rows,
  filterActive = false,
  onClose,
  onToggleFilter,
}: {
  open: boolean;
  /** Riders holding cash, already filtered and sorted by ridersHoldingCash(). */
  rows: RiderCashPosition[];
  /** True when the rider list below is already narrowed to these riders. */
  filterActive?: boolean;
  onClose: () => void;
  /** Optional: narrow (or widen) the rider list to these riders. */
  onToggleFilter?: () => void;
}) {
  const total = cashOnHandTotal(rows);

  return (
    <Dialog open={open} onClose={onClose} title="Cash to collect">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? "No rider is holding customer cash right now."
            : `${rows.length === 1 ? "One rider is" : `${rows.length} riders are`} holding ${formatCurrency(total)} collected from customers and not handed back yet.`}
        </p>

        {rows.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {rows.map((row) => (
              <li
                key={row.riderId}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <Link
                  href={`/dashboard/riders/${row.riderId}`}
                  className="truncate text-sm font-medium text-card-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {row.riderName}
                </Link>
                <span className="shrink-0 text-sm font-semibold text-card-foreground">
                  {formatCurrency(row.onHand)}
                </span>
              </li>
            ))}
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
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Dialog>
  );
}
