"use client";

import Link from "next/link";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency } from "@/lib/format";
import { RiderFlagBadges } from "@/components/rider/rider-row-bits";
import { riderFlags } from "@/lib/rider-flags";
import type { RiderFilter } from "@/lib/rider-list-params";
import type { RiderOverview } from "@/lib/types";

/**
 * Status cards that double as the list filter.
 *
 * The status counts deliberately exclude archived and suspended riders. An
 * archived rider keeps whatever `status` they last had, so counting them would
 * let the card say "Online 3" while dispatch offers the order to nobody --
 * precisely the mismatch 0036's comment warns about for the dispatch count. The
 * archived and suspended cards exist to surface those riders instead.
 */
export function RiderSummaryCards({
  rows,
  filter,
  onFilterChange,
  pendingApplications = 0,
}: {
  rows: RiderOverview[];
  filter: RiderFilter;
  onFilterChange: (next: RiderFilter) => void;
  /**
   * Applications waiting on a decision. Not one of the rider status cards --
   * an applicant has no rider row yet -- so it is a separate figure that links
   * to the queue rather than a filter over these rows.
   */
  pendingApplications?: number;
}) {
  const dispatchable = rows.filter((r) => !r.archivedAt && !r.suspendedAt);
  const count = (status: RiderOverview["status"]) =>
    dispatchable.filter((r) => r.status === status).length;

  const cards: {
    key: RiderFilter;
    label: string;
    value: number;
    hint: string;
  }[] = [
    { key: "online", label: "Online", value: count("online"), hint: "Can be offered work" },
    { key: "busy", label: "Busy", value: count("busy"), hint: "On a delivery now" },
    { key: "offline", label: "Offline", value: count("offline"), hint: "Not taking work" },
    { key: "archived", label: "Archived", value: rows.filter((r) => r.archivedAt).length, hint: "Hidden from dispatch" },
    { key: "suspended", label: "Suspended", value: rows.filter((r) => r.suspendedAt).length, hint: "Held, with a reason" },
  ];

  return (
    <div
      className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      role="group"
      aria-label="Filter riders by status"
    >
      {cards.map((card) => (
        <StatCard
          key={card.key}
          kpi={{ label: card.label, value: String(card.value), hint: card.hint }}
          active={filter === card.key}
          onClick={() => onFilterChange(filter === card.key ? "all" : card.key)}
          className="p-4"
        />
      ))}
      {/* Sits in the same row because it is the same question -- "is there work
          waiting on me" -- answered for people who are not riders yet. */}
      <Link
        href="/dashboard/riders#applications"
        className="rounded-(--radius-card) border border-border bg-card p-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <p className="text-sm text-muted-foreground">Applications</p>
        <p className="mt-2 text-2xl font-bold tracking-tight text-card-foreground">
          {pendingApplications}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {pendingApplications === 1
            ? "Waiting on a decision"
            : "Waiting on decisions"}
        </p>
      </Link>
    </div>
  );
}

/**
 * Both panels derive from the rows already on screen. No extra request, no
 * per-row lookup: the numbers admin_rider_overview() returned are the numbers
 * these rank.
 */
export function RiderInsightPanels({ rows }: { rows: RiderOverview[] }) {
  const active = rows.filter((r) => !r.archivedAt && !r.suspendedAt);

  const topRiders = [...active]
    .filter((r) => r.weekEarnings > 0)
    .sort((a, b) => b.weekEarnings - a.weekEarnings)
    .slice(0, 5);

  const needsAttention = active
    .map((rider) => ({ rider, flags: riderFlags(flagsInput(rider)) }))
    .filter((entry) => entry.flags.length > 0)
    .sort((a, b) => b.flags.length - a.flags.length || a.rider.name.localeCompare(b.rider.name))
    .slice(0, 5);

  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-2">
      <section aria-label="Top riders this week" className="rounded-(--radius-card) border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-card-foreground">
          Top riders this week
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Payouts recorded since Monday, from the earnings ledger.
        </p>
        {topRiders.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No completed deliveries yet this week.
          </p>
        ) : (
          <ol className="mt-4 flex flex-col gap-2">
            {topRiders.map((rider, index) => (
              <li key={rider.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex items-baseline gap-2">
                  <span className="w-4 text-xs text-muted-foreground">{index + 1}</span>
                  <Link
                    href={`/dashboard/riders/${rider.id}`}
                    className="text-card-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {rider.name}
                  </Link>
                </span>
                <span className="font-medium text-card-foreground">
                  {formatCurrency(rider.weekEarnings)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Needs attention" className="rounded-(--radius-card) border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-card-foreground">
          Needs attention
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Same thresholds as the Flags column.
        </p>
        {needsAttention.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Nothing flagged. Every active rider has an account and a clean record.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {needsAttention.map(({ rider, flags }) => (
              <li key={rider.id} className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/dashboard/riders/${rider.id}`}
                  className="text-sm text-card-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {rider.name}
                </Link>
                <RiderFlagBadges flags={flags} riderName={rider.name} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** The shape lib/rider-flags.ts takes, read off a list row. */
export function flagsInput(rider: RiderOverview) {
  return {
    rating: rider.rating,
    deliveredCount: rider.deliveredCount,
    failedCount: rider.failedCount,
    hasAccount: rider.userId !== null,
    deletionRequested: rider.deletionRequestedAt !== null,
  };
}