"use client";

import Link from "next/link";
import type { Column } from "@/components/ui/data-table";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArchiveButton } from "@/components/ui/archive-button";
import { LinkIcon } from "@/components/ui/icons";
import { formatCurrency } from "@/lib/format";
import { riderFlags } from "@/lib/rider-flags";
import { setRiderArchived, setRiderStatus, type RiderAccess } from "@/lib/supabase/queries";
import type { Rider, RiderCashPosition, RiderOverview } from "@/lib/types";
import { flagsInput } from "@/components/rider/rider-summary";
import {
  RiderFlagBadges,
  SuspendedBadge,
} from "@/components/rider/rider-row-bits";

/**
 * The fleet list's columns.
 *
 * A builder rather than a constant because several cells are actions, and an
 * action needs the page's callbacks -- the suspend dialog, the account
 * attach/revoke dialogs, and the pending state that disables a row's controls
 * while its write is in flight. Everything that is not a callback (formatting,
 * badges, links) is still just a column definition.
 */
export interface RiderColumnHandlers {
  onSuspend: (rider: RiderOverview) => void;
  onReinstate: (rider: RiderOverview) => void;
  onAttach: (account: RiderAccess) => void;
  onRevoke: (account: RiderAccess) => void;
  onChanged: () => void | Promise<void>;
  accounts: Map<string, RiderAccess>;
  /** Cash position per rider id (0079). Missing means the read failed. */
  cash: Map<string, RiderCashPosition>;
  isPending: (key: string) => boolean;
  statusKey: (riderId: string) => string;
  archiveKey: (riderId: string) => string;
  runAction: (
    key: string,
    fn: () => Promise<void>,
    options?: { rethrow?: boolean },
  ) => Promise<unknown>;
}

export function buildRiderColumns({
  onSuspend,
  onReinstate,
  onAttach,
  onRevoke,
  onChanged,
  accounts,
  cash,
  isPending,
  statusKey,
  archiveKey,
  runAction,
}: RiderColumnHandlers): Column<RiderOverview>[] {
  return [
    {
      key: "name",
      header: "Rider",
      cell: (row) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={row.name} size="sm" />
          <span className="min-w-0">
            <span className="block font-medium text-card-foreground">
              {row.name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {row.email || "No email on file"}
            </span>
          </span>
          {row.archivedAt ? (
            <Badge variant="secondary" size="sm">
              Archived
            </Badge>
          ) : null}
          <SuspendedBadge
            suspendedAt={row.suspendedAt ?? null}
            reason={row.suspendedReason ?? null}
          />
        </span>
      ),
    },
    { key: "city", header: "City", cell: (row) => row.city },
    {
      key: "vehicle",
      header: "Vehicle",
      cell: (row) => (
        <Badge variant="secondary" size="sm">
          {row.vehicle}
        </Badge>
      ),
    },
    {
      key: "current_order_reference",
      header: "Current job",
      cell: (row) =>
        row.currentOrderReference ? (
          <Link
            href={`/dashboard/orders?order=${row.currentOrderReference}`}
            className="inline-flex items-center gap-1 text-sm text-card-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LinkIcon className="h-3.5 w-3.5" />
            {row.currentOrderReference}
          </Link>
        ) : (
          <span className="text-muted-foreground">Idle</span>
        ),
    },
    {
      key: "deliveries",
      header: "Deliveries",
      align: "right",
      // deliveredCount, not riders.deliveries. That column is a counter the
      // schema increments but never reset when the payout ledger replaced it in
      // 0038, so it still carries pre-ledger history and disagrees with the
      // rider's own Earnings tab. delivered_count counts delivered orders, which
      // is also what /dashboard/riders/[id] reports.
      cell: (row) => (
        <span className="text-card-foreground">{row.deliveredCount}</span>
      ),
    },
    {
      key: "rating",
      header: "Rating",
      align: "right",
      cell: (row) => <span className="text-card-foreground">{row.rating} ★</span>,
    },
    {
      key: "week_earnings",
      header: "This week",
      align: "right",
      cell: (row) => (
        <span className="font-medium text-card-foreground">
          {formatCurrency(row.weekEarnings)}
        </span>
      ),
    },
    {
      key: "earnings",
      header: "Total earned",
      align: "right",
      // riders.earnings is maintained by rider_mark_delivered in the same
      // statement that writes the ledger row, and 0038 reconciled it to the
      // ledger sum -- so it is ledger-consistent and safe to read here. It is
      // still the denormalised column, not a live sum.
      cell: (row) => (
        <span className="font-medium text-card-foreground">
          {formatCurrency(row.earnings)}
        </span>
      ),
    },
    {
      // The other direction of the same money (0079). Earnings are what the
      // platform owes the rider; cash on hand is what the rider owes the
      // platform, and it is the number that decides who needs to bank today.
      key: "cash_on_hand",
      header: "Cash on hand",
      align: "right",
      cell: (row) => {
        const position = cash.get(row.id);
        if (!position) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <span className="flex flex-col items-end gap-0.5">
            <span
              className={
                position.onHand > 0.005
                  ? "font-medium text-warning"
                  : "font-medium text-card-foreground"
              }
            >
              {formatCurrency(position.onHand)}
            </span>
            {position.flagged > 0 ? (
              <span className="text-xs text-warning">
                {formatCurrency(position.flagged)} variance
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "flags",
      header: "Flags",
      cell: (row) => (
        <RiderFlagBadges flags={riderFlags(flagsInput(row))} riderName={row.name} />
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) =>
        row.archivedAt || row.suspendedAt ? (
          <span className="text-muted-foreground">
            {row.archivedAt ? "Archived" : "Suspended"}
          </span>
        ) : (
          <Select
            value={row.status}
            aria-label={`Set status for ${row.name}`}
            className="h-8 w-32"
            disabled={isPending(statusKey(row.id))}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const next = e.target.value as Rider["status"];
              void runAction(statusKey(row.id), async () => {
                await setRiderStatus(row.id, next);
                await onChanged();
              });
            }}
          >
            <option value="online">Online</option>
            {/* admin_dispatch_order inserts offers only where status = 'online',
                so "Busy" takes a rider out of dispatch exactly as "Offline"
                does. It is kept because it is a valid rider self-declaration
                (rider_set_status accepts it) and the distinction is meaningful to
                a dispatcher, but it is not a separate dispatch state and the
                label says so rather than implying one. */}
            <option value="busy">Busy — not offered work</option>
            <option value="offline">Offline — not offered work</option>
          </Select>
        ),
    },
    {
      // The account the rider signs in with, and whether they have one at all.
      // This replaces the standalone "Rider access" table, which listed the same
      // rows as the fleet list with the same attach/revoke buttons -- so every
      // rider appeared twice on one page with two ways to change the same thing.
      key: "account",
      header: "Account",
      cell: (row) => {
        const linked = accounts.get(row.id);
        if (!linked) {
          return (
            <span className="text-muted-foreground">
              No account — cannot sign in
            </span>
          );
        }
        return (
          <span className="flex flex-col items-start gap-1">
            <span className="text-card-foreground">{linked.email}</span>
            <span className="flex gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onAttach(linked);
                }}
              >
                {linked.userId ? "Reassign" : "Attach"}
              </Button>
              {linked.userId ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRevoke(linked);
                  }}
                >
                  Revoke
                </Button>
              ) : null}
            </span>
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <span className="flex justify-end gap-2">
          {row.suspendedAt ? (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onReinstate(row);
              }}
            >
              Reinstate
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onSuspend(row);
              }}
            >
              Suspend
            </Button>
          )}
          <ArchiveButton
            name={row.name}
            archived={Boolean(row.archivedAt)}
            onChange={(archived) =>
              runAction(archiveKey(row.id), async () => {
                await setRiderArchived(row.id, archived);
                await onChanged();
              }, { rethrow: true }).then(() => undefined)
            }
          />
        </span>
      ),
    },
  ];
}
