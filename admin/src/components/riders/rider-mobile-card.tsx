"use client";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { LinkIcon } from "@/components/ui/icons";
import { formatCurrency } from "@/lib/format";
import { riderFlags } from "@/lib/rider-flags";
import type { RiderCashPosition, RiderOverview } from "@/lib/types";
import { flagsInput } from "@/components/rider/rider-summary";
import {
  ContactShortcuts,
  RiderFlagBadges,
  SuspendedBadge,
} from "@/components/rider/rider-row-bits";

/** Card layout below `md`, where the table would scroll horizontally. */
export function RiderMobileCard({
  rider,
  cash,
}: {
  rider: RiderOverview;
  /** Cash position (0079). Absent when the cash read failed. */
  cash?: RiderCashPosition;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={rider.name} size="sm" />
          <span className="min-w-0">
            <span className="block font-medium text-card-foreground">
              {rider.name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {rider.email || "No email on file"}
            </span>
          </span>
        </span>
        <StatusBadge status={rider.status} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {rider.archivedAt ? (
          <Badge variant="secondary" size="sm">
            Archived
          </Badge>
        ) : null}
        <SuspendedBadge
          suspendedAt={rider.suspendedAt ?? null}
          reason={rider.suspendedReason ?? null}
        />
        <Badge variant="secondary" size="sm">
          {rider.vehicle}
        </Badge>
        <span className="text-xs text-muted-foreground">{rider.city}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {rider.currentOrderReference ? (
          <Link
            href={`/dashboard/orders?order=${rider.currentOrderReference}`}
            className="inline-flex items-center gap-1 text-card-foreground underline-offset-2 hover:underline"
          >
            <LinkIcon className="h-3.5 w-3.5" />
            {rider.currentOrderReference}
          </Link>
        ) : (
          <span>Idle</span>
        )}
        <span>{rider.deliveredCount} deliveries</span>
        <span>{rider.rating} ★</span>
        <span>Week {formatCurrency(rider.weekEarnings)}</span>
        <span>Total {formatCurrency(rider.earnings)}</span>
        {cash ? (
          <span className={cash.onHand > 0.005 ? "text-warning" : undefined}>
            Cash on hand {formatCurrency(cash.onHand)}
          </span>
        ) : null}
      </div>

      <RiderFlagBadges flags={riderFlags(flagsInput(rider))} riderName={rider.name} />

      <div className="flex flex-wrap gap-2 pt-1">
        <ContactShortcuts
          name={rider.name}
          phone={rider.phone}
          email={rider.email}
        />
        {rider.suspendedAt ? (
          <Button variant="outline" size="sm">
            Reinstate
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            Suspend
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Add/edit form.
 *
 * EntityDialog owns the field layout and only checks `required`, so the real
 * rules -- PH mobile shape, email shape, duplicate email -- are validated on
 * submit and reported per field. They run before the request rather than being
 * left to the database, because a duplicate email otherwise surfaces as a 23505
 * after the admin has finished typing.
 */
