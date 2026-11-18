"use client";

import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import {
  CANCELLATION_KIND_LABEL,
  DAILY_CANCEL_LIMIT,
  type RiderCancellationSummary,
} from "@/lib/rider-cancellation-summary";

/**
 * Riders who gave up jobs, worst first (0155). A rider who reached today's
 * limit can no longer cancel; the list is for following up with the ones who
 * cancel often.
 */
export function RiderCancellationsDialog({
  open,
  rows,
  onClose,
}: {
  open: boolean;
  rows: RiderCancellationSummary[];
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Rider cancellations">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? "No rider has cancelled a job in the last 7 days."
            : `Riders may cancel ${DAILY_CANCEL_LIMIT} jobs a day: a warning each time, then the button is turned off. Last 7 days, most cancellations first.`}
        </p>

        {rows.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <li key={row.riderId} className="rounded-lg border border-border">
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <Link
                    href={`/dashboard/riders/${row.riderId}`}
                    className="truncate text-sm font-medium text-card-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {row.riderName}
                  </Link>
                  <span className="flex items-center gap-2">
                    <Badge
                      variant={
                        row.atLimit
                          ? "destructive"
                          : row.today > 0
                            ? "warning"
                            : "secondary"
                      }
                      size="sm"
                    >
                      Today {row.today} of {DAILY_CANCEL_LIMIT}
                      {row.atLimit ? " · blocked" : ""}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {row.week} in 7 days
                    </span>
                  </span>
                </div>
                <ul className="divide-y divide-border border-t border-border">
                  {row.entries.map((entry, i) => (
                    <li
                      key={`${entry.createdAt}-${i}`}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-1.5 text-xs"
                    >
                      <span className="text-muted-foreground">
                        {formatDateTime(entry.createdAt)}
                      </span>
                      <span className="font-medium text-card-foreground">
                        {CANCELLATION_KIND_LABEL[entry.kind]}{" "}
                        {entry.reference ?? ""}
                      </span>
                      <span className="min-w-0 flex-1 text-muted-foreground">
                        {entry.reason ?? "No reason given"}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex justify-end pt-1">
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
