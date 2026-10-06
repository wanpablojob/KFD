"use client";

import type { Column } from "@/components/ui/data-table";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import type { RiderApplication } from "@/lib/supabase/queries";
import { formatWaiting, isWaitingTooLong } from "@/lib/rider-applications";

/**
 * The application queue's columns.
 *
 * Pure apart from the two Review/View buttons, which hand the row back to the
 * page's drawer. The waiting-time column is the reason the queue is sorted the
 * way it is: an unreviewed application is the only row here that ages.
 */
export function buildApplicationColumns(
  onOpen: (row: RiderApplication) => void,
): Column<RiderApplication>[] {
  return [
    {
      key: "fullName",
      header: "Applicant",
      cell: (row) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={row.fullName} size="sm" />
          <span>
            <span className="block font-medium text-card-foreground">
              {row.fullName}
            </span>
            <span className="block text-xs text-muted-foreground">
              {row.applicantEmail}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "vehicle",
      header: "Vehicle",
      cell: (row) => (
        <span className="text-card-foreground">
          {row.vehicle} · {row.city}
        </span>
      ),
    },
    {
      key: "phone",
      header: "Phone",
      cell: (row) => <span className="text-card-foreground">{row.phone}</span>,
    },
    {
      key: "waitingDays",
      header: "Waiting",
      align: "right",
      // Oldest first. The SQL already orders that way, but reviewed rows carry
      // waiting_days 0 and pending rows do not, so the queue is re-sorted on the
      // number the column actually shows.
      cell: (row) => {
        if (row.status !== "pending") {
          return <span className="text-muted-foreground">—</span>;
        }
        const overdue = isWaitingTooLong(row.waitingDays);
        return (
          <span
            className={overdue ? "font-medium text-destructive" : undefined}
          >
            {formatWaiting(row.createdAt)}
          </span>
        );
      },
    },
    {
      key: "documents",
      header: "Documents",
      cell: (row) => {
        const supplied = [
          ["Licence", row.licenceRef],
          ["ORCR", row.orcrRef],
          ["ID", row.governmentIdRef],
        ].filter(([, ref]) => ref);
        return (
          <span className="text-muted-foreground">
            {supplied.length === 3
              ? "All 3 supplied"
              : supplied.length > 0
                ? `${supplied.length} of 3 supplied`
                : "None supplied"}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <span className="flex flex-col items-start gap-1">
          <StatusBadge status={row.status} />
          {row.decisionNote ? (
            <span className="max-w-56 truncate text-xs text-muted-foreground">
              {firstLine(row.decisionNote)}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      // Who decided. Null while pending, and "(deleted account)" if the
      // reviewer's auth row is gone -- both read differently from a blank cell,
      // which would say nobody reviewed it.
      key: "reviewerEmail",
      header: "Reviewed by",
      cell: (row) =>
        row.reviewerEmail ? (
          <span className="text-card-foreground">{row.reviewerEmail}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "reviewedAt",
      header: "Reviewed",
      cell: (row) =>
        row.reviewedAt ? (
          <span className="whitespace-nowrap text-muted-foreground">
            {new Date(row.reviewedAt).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) =>
        row.status === "pending" ? (
          <Button size="sm" onClick={() => onOpen(row)}>
            Review
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpen(row)}
          >
            View
          </Button>
        ),
    },
  ];
}

/** The decision note's first line, for the narrow Status cell. */
export function firstLine(text: string): string {
  return text.split("\n")[0];
}
