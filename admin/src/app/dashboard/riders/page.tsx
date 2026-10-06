"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  fetchRiderAccess,
  fetchRiderApplications,
  fetchRiderOverview,
  reviewRiderApplication,
  revokeRiderAccess,
  setRiderAccess,
  setRiderArchived,
  setRiderStatus,
  setRiderSuspended,
  upsertRider,
  type RiderAccess,
  type RiderApplication,
} from "@/lib/supabase/queries";
import { formatCurrency } from "@/lib/format";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/status";
import { PaginatedDataTable } from "@/components/ui/paginated-data-table";
import { EntityDialog, type DialogField } from "@/components/ui/entity-dialog";
import { ArchiveButton } from "@/components/ui/archive-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PlusIcon, LinkIcon } from "@/components/ui/icons";
import type { Column } from "@/components/ui/data-table";
import { useAsyncData } from "@/lib/use-async-data";
import { TableBoundary } from "@/components/ui/table-boundary";
import type { Rider, RiderOverview } from "@/lib/types";
import { useRiderListView } from "@/lib/use-rider-list-view";
import { compareRiders, type RiderFilter } from "@/lib/rider-list-params";
import { riderFlags } from "@/lib/rider-flags";
import {
  friendlyRiderSaveError,
  validateRiderFields,
  type RiderFieldError,
} from "@/lib/rider-validation";
import {
  ContactShortcuts,
  RiderFlagBadges,
  SuspendedBadge,
} from "@/components/rider/rider-row-bits";
import {
  RiderInsightPanels,
  RiderSummaryCards,
  flagsInput,
} from "@/components/rider/rider-summary";
import { SuspendRiderDialog } from "@/components/rider/suspend-rider-dialog";
import {
  DOCUMENT_CHECKS,
  EXTERNAL_LINK_PROPS,
  classifyDocumentRef,
  composeDecisionNote,
  formatWaiting,
  isWaitingTooLong,
  parseDecisionNote,
  type DocumentCheckKey,
  type DocumentField,
} from "@/lib/rider-applications";

const FIELDS: DialogField[] = [
  { key: "name", label: "Name", required: true },
  { key: "email", label: "Email", required: true },
  { key: "phone", label: "Phone" },
  { key: "city", label: "City" },
  {
    key: "vehicle",
    label: "Vehicle",
    options: ["bicycle", "scooter", "motorcycle", "car"],
  },
  { key: "status", label: "Status", options: ["online", "busy", "offline"] },
];

type Mode =
  | { kind: "reassign"; row: RiderAccess }
  | { kind: "revoke"; row: RiderAccess }
  | { kind: "review"; row: RiderApplication }
  | { kind: "suspend"; rider: RiderOverview }
  | { kind: "reinstate"; rider: RiderOverview }
  | null;

export default function RidersPage() {
  const router = useRouter();
  const overview = useAsyncData(() => fetchRiderOverview());
  const access = useAsyncData(() => fetchRiderAccess());
  // An applicant has no rider row yet, so it cannot appear in the rider list.
  // Fetched unfiltered because the same panel shows reviewed rows underneath
  // pending ones, and the SQL already orders pending first.
  const applications = useAsyncData(() => fetchRiderApplications());
  const { params, set } = useRiderListView();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  /**
   * One runner for every mutation, because each of them has the same three
   * obligations: show a spinner, surface the database's message rather than a
   * generic failure, and re-read whichever lists the change touched. Approving
   * an application creates a rider row this page has never seen, which is why
   * this refetches the overview instead of patching a row locally.
   */
  async function run(
    action: () => Promise<void>,
    success?: string,
  ): Promise<void> {
    setBusy(true);
    setActionError(null);
    setActionNotice(null);
    try {
      await action();
      if (success) setActionNotice(success);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not save.");
      // Keep the dialog open on failure: closing it would throw away the reason
      // an admin typed into the suspension or decision field.
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  const allRiders = overview.data ?? [];
  const existingEmails = allRiders.map((rider) => rider.email);

  const rows = allRiders
    .filter((rider) => {
      switch (params.filter) {
        case "online":
        case "busy":
        case "offline":
          // Archived and suspended riders keep whatever status they last had,
          // so the status counts have to exclude them or "Online 3" can be
          // sitting above three riders dispatch would never offer work to.
          return (
            !rider.archivedAt &&
            !rider.suspendedAt &&
            rider.status === params.filter
          );
        case "archived":
          return Boolean(rider.archivedAt);
        case "suspended":
          return Boolean(rider.suspendedAt);
        default:
          return true;
      }
    })
    .sort((a, b) =>
      compareRiders(
        a as unknown as Record<string, unknown>,
        b as unknown as Record<string, unknown>,
        params.sort,
        params.dir,
      ),
    );

  const riderColumns: Column<RiderOverview>[] = [
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
            onClick={(e) => e.stopPropagation()}
            onChange={async (e) => {
              await setRiderStatus(row.id, e.target.value as Rider["status"]);
              await overview.refetch();
            }}
          >
            <option value="online">Online</option>
            <option value="busy">Busy</option>
            <option value="offline">Offline</option>
          </Select>
        ),
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
                setMode({ kind: "reinstate", rider: row });
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
                setMode({ kind: "suspend", rider: row });
              }}
            >
              Suspend
            </Button>
          )}
          <ArchiveButton
            name={row.name}
            archived={Boolean(row.archivedAt)}
            onChange={async (archived) => {
              await setRiderArchived(row.id, archived);
              await overview.refetch();
            }}
          />
        </span>
      ),
    },
  ];

  const accessColumns: Column<RiderAccess>[] = [
    {
      key: "riderName",
      header: "Rider",
      cell: (row) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={row.riderName} size="sm" />
          <span className="font-medium text-card-foreground">
            {row.riderName}
          </span>
          {row.archivedAt ? (
            <Badge variant="secondary" size="sm">
              Archived
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: "email",
      header: "Account",
      cell: (row) =>
        row.userId ? (
          <span className="font-medium text-card-foreground">{row.email}</span>
        ) : (
          <span className="text-muted-foreground">
            Not linked — this rider cannot sign in
          </span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <span className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMode({ kind: "reassign", row })}
          >
            {row.userId ? "Reassign" : "Attach"}
          </Button>
          {row.userId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMode({ kind: "revoke", row })}
            >
              Revoke
            </Button>
          ) : null}
        </span>
      ),
    },
  ];

  const allApplications = applications.data ?? [];
  const pendingCount = allApplications.filter((a) => a.status === "pending").length;

  const applicationColumns: Column<RiderApplication>[] = [
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
      key: "actions",
      header: "",
      align: "right",
      cell: (row) =>
        row.status === "pending" ? (
          <Button size="sm" onClick={() => setMode({ kind: "review", row })}>
            Review
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMode({ kind: "review", row })}
          >
            View
          </Button>
        ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Riders"
        description="Fleet of active delivery partners."
        actions={
          <Button onClick={() => setOpen(true)}>
            <PlusIcon className="h-4 w-4" />
            Add Rider
          </Button>
        }
      />

      <RiderSummaryCards
        rows={allRiders}
        filter={params.filter}
        onFilterChange={(next: RiderFilter) => set({ filter: next })}
      />
      <RiderInsightPanels rows={allRiders} />

      <Section aria-label="Rider list">
        <TableBoundary
          loading={overview.loading}
          error={overview.error}
          onRetry={overview.refetch}
          errorTitle="Could not load riders"
          skeletonRows={8}
          skeletonColumns={12}
        >
          <Card className="overflow-hidden">
            <PaginatedDataTable<RiderOverview>
              columns={riderColumns}
              rows={rows}
              searchFields={["name", "email", "phone", "city", "id"]}
              searchQuery={params.query}
              onRowClick={(row) => router.push(`/dashboard/riders/${row.id}`)}
              emptyTitle="No riders found"
              emptyDescription={
                params.filter === "all"
                  ? "Add a rider, or approve an application below."
                  : "No rider has this status right now."
              }
              exportName="/dashboard/riders"
              exportColumns={[
                { key: "name", header: "Rider" },
                { key: "email", header: "Email" },
                { key: "city", header: "City" },
                { key: "vehicle", header: "Vehicle" },
                { key: "deliveredCount", header: "Deliveries" },
                { key: "rating", header: "Rating" },
                { key: "earnings", header: "Earnings" },
                { key: "status", header: "Status" },
              ]}
              sort={{ key: params.sort, dir: params.dir }}
              onSortChange={(next) => set({ sort: next.key as typeof params.sort, dir: next.dir })}
              sortableKeys={[
                "name",
                "city",
                "vehicle",
                "deliveries",
                "rating",
                "earnings",
                "week_earnings",
                "current_order_reference",
              ]}
              page={params.page}
              onPageChange={(next) => set({ page: next })}
              mobileCard={(row) => <RiderMobileCard rider={row} />}
            />
          </Card>
        </TableBoundary>
      </Section>

      {actionNotice ? (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {actionNotice}
        </p>
      ) : null}
      {actionError && !mode ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}

      <Section aria-label="Rider applications" className="mt-8">
        <h2 className="mb-1 text-lg font-semibold text-card-foreground">
          Applications
          {pendingCount > 0 ? (
            <Badge variant="primary" size="sm" className="ml-2">
              {pendingCount} pending
            </Badge>
          ) : null}
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          People who applied to deliver from the app, oldest request first.
          Approving creates their rider record and lets them sign in; it does not
          put them online, which is their own tap on the availability toggle.
        </p>
        <TableBoundary
          loading={applications.loading}
          error={applications.error}
          onRetry={applications.refetch}
          errorTitle="Could not load rider applications"
          skeletonRows={3}
        >
          {allApplications.length === 0 ? (
            <EmptyState
              title="No applications yet"
              description="Applications submitted from the rider app land here."
            />
          ) : (
            <Card className="overflow-hidden">
              <DataTable columns={applicationColumns} rows={allApplications} />
            </Card>
          )}
        </TableBoundary>
      </Section>

      <Section aria-label="Rider access" className="mt-8">
        <h2 className="mb-1 text-lg font-semibold text-card-foreground">
          Rider access
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Attach an existing account to a rider so they can sign in to the rider
          app. Accounts are not created here — sign the rider up in Supabase
          Auth first, or they will sign in to nothing.
        </p>
        <TableBoundary
          loading={access.loading}
          error={access.error}
          onRetry={access.refetch}
          errorTitle="Could not load rider access"
          skeletonRows={4}
        >
          {(access.data ?? []).length === 0 ? (
            <EmptyState
              title="No riders"
              description="Add a rider above, then attach an account to it."
            />
          ) : (
            <Card className="overflow-hidden">
              <DataTable columns={accessColumns} rows={access.data ?? []} />
            </Card>
          )}
        </TableBoundary>
      </Section>

      {open ? (
        <RiderFormDialog
          existingEmails={existingEmails}
          onClose={() => setOpen(false)}
          onSave={async (values) => {
            await run(async () => {
              try {
                await upsertRider({
                  name: values.name,
                  email: values.email,
                  phone: values.phone,
                  city: values.city,
                  vehicle: values.vehicle as Rider["vehicle"],
                  status: values.status as Rider["status"],
                });
              } catch (cause) {
                throw new Error(
                  friendlyRiderSaveError(cause) ??
                    (cause instanceof Error ? cause.message : "Could not save."),
                );
              }
            }, `Added ${values.name}.`);
            await overview.refetch();
            setOpen(false);
          }}
        />
      ) : null}

      {mode?.kind === "reassign" ? (
        <EntityDialog
          open
          key={mode.row.riderId}
          title={`Attach account to ${mode.row.riderName}`}
          description="If the account already rides for someone else, it moves here and the other rider keeps their delivery history."
          onClose={() => setMode(null)}
          initial={{ email: mode.row.userId ? mode.row.email : "" }}
          fields={[
            {
              key: "email",
              label: "Account email",
              type: "text",
              required: true,
              placeholder: "rider@kfd.com",
            },
          ]}
          onSave={(values) =>
            run(async () => {
              await setRiderAccess(values.email.trim(), mode.row.riderId);
              await access.refetch();
              await overview.refetch();
              setMode(null);
            }, `${values.email.trim()} is now linked to ${mode.row.riderName}.`)
          }
        />
      ) : null}

      {mode?.kind === "revoke" ? (
        <RevokeRiderDialog
          email={mode.row.email}
          riderName={mode.row.riderName}
          busy={busy}
          onClose={() => setMode(null)}
          onConfirm={() =>
            run(async () => {
              await revokeRiderAccess(mode.row.email);
              await access.refetch();
              await overview.refetch();
              setMode(null);
            }, `${mode.row.email} can no longer sign in as a rider. The login itself still exists.`)
          }
        />
      ) : null}

      {mode?.kind === "suspend" || mode?.kind === "reinstate" ? (
        <SuspendRiderDialog
          riderName={mode.rider.name}
          suspending={mode.kind === "suspend"}
          busy={busy}
          onClose={() => setMode(null)}
          onConfirm={async (reason) => {
            await run(async () => {
              await setRiderSuspended(
                mode.rider.id,
                mode.kind === "suspend",
                reason,
              );
              await overview.refetch();
              setMode(null);
            },
            mode.kind === "suspend"
              ? `${mode.rider.name} is suspended and will not be offered orders.`
              : `${mode.rider.name} is reinstated.`);
          }}
        />
      ) : null}

      {mode?.kind === "review" ? (
        <ReviewApplicationDialog
          application={mode.row}
          busy={busy}
          // Client-side hint. review_rider_application() is what actually
          // refuses the approval (0051), because a hint that can be bypassed is
          // not an enforcement.
          emailTaken={existingEmails.some(
            (email) => email.trim().toLowerCase() === mode.row.applicantEmail.trim().toLowerCase(),
          )}
          onClose={() => setMode(null)}
          onDecide={async (approve, note) => {
            await run(async () => {
              const result = await reviewRiderApplication(mode.row.id, approve, note);
              await Promise.all([
                applications.refetch(),
                overview.refetch(),
                access.refetch(),
              ]);
              setActionNotice(
                approve
                  ? `Approved. ${mode.row.fullName} can now sign in as a rider (${result}).`
                  : `Rejected ${mode.row.fullName}'s application.`,
              );
              setMode(null);
            });
          }}
        />
      ) : null}
    </PageContainer>
  );
}

function firstLine(text: string): string {
  return text.split("\n")[0];
}

/** Card layout below `md`, where the table would scroll horizontally. */
function RiderMobileCard({ rider }: { rider: RiderOverview }) {
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
function RiderFormDialog({
  existingEmails,
  onClose,
  onSave,
}: {
  existingEmails: readonly string[];
  onClose: () => void;
  onSave: (values: Record<string, string>) => Promise<void>;
}) {
  return (
    <EntityDialog
      open
      title="Add Rider"
      description="Email and phone are how dispatch reaches this rider. Both are required."
      fields={FIELDS}
      initial={{ city: "", vehicle: "scooter", status: "offline" }}
      onClose={onClose}
      onSave={async (values) => {
        // EntityDialog catches and displays a thrown message, so every rule is
        // reported at once rather than one round-trip per field.
        const found = validateRiderFields(
          {
            name: values.name ?? "",
            email: values.email ?? "",
            phone: values.phone ?? "",
            city: values.city ?? "",
          },
          existingEmails,
        );
        if (found.length > 0) {
          throw new Error(
            found
              .map((error) => `${labelFor(error)}: ${error.message}`)
              .join(" "),
          );
        }
        await onSave(values);
      }}
    />
  );
}

function labelFor(error: RiderFieldError): string {
  return FIELDS.find((field) => field.key === error.field)?.label ?? error.field;
}

/**
 * Not an EntityDialog: revoking is destructive, so it needs copy that says what
 * survives. EntityDialog has no description slot.
 */
function RevokeRiderDialog({
  email,
  riderName,
  busy,
  onClose,
  onConfirm,
}: {
  email: string;
  riderName: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <Dialog
      open
      onClose={busy ? () => {} : onClose}
      title="Revoke rider access?"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {email} will immediately lose access to the rider app. {riderName}{" "}
          keeps their rider row, so their delivery count, rating and earnings
          are untouched.
        </p>
        <p className="text-sm text-muted-foreground">
          The sign-in itself is not deleted, so this can be undone by attaching
          the account again.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? "Revoking…" : "Revoke access"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function DocumentLinks({ fields }: { fields: DocumentField[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {fields.map((field) => {
        const doc = classifyDocumentRef(field.ref, field.label);
        return (
          <li key={field.label} className="text-sm">
            <span className="text-muted-foreground">{field.label}: </span>
            {doc.kind === "missing" ? (
              <span className="text-destructive">not supplied</span>
            ) : doc.kind === "link" ? (
              <a
                href={doc.href}
                {...EXTERNAL_LINK_PROPS}
                className="text-card-foreground underline underline-offset-2"
              >
                Open {doc.label.toLowerCase()}
              </a>
            ) : (
              <span className="font-mono text-xs text-card-foreground">
                {doc.label}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The application drawer: everything submitted, the document checklist, and the
 * decision.
 *
 * The checklist is the point. `review_rider_application()` will happily approve
 * an applicant whose documents were never looked at, so an admin can tick what
 * they verified, or tick the override box and say in the note why. Approving
 * with nothing ticked is allowed -- an override with a note is a record; a
 * silent approval is not.
 */
function ReviewApplicationDialog({
  application,
  busy,
  emailTaken,
  onClose,
  onDecide,
}: {
  application: RiderApplication;
  busy: boolean;
  emailTaken: boolean;
  onClose: () => void;
  onDecide: (approve: boolean, note: string | undefined) => Promise<void>;
}) {
  const reviewed = application.status !== "pending";
  const [checks, setChecks] = useState<DocumentCheckKey[]>([]);
  const [overridden, setOverridden] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const prior = parseDecisionNote(application.decisionNote);

  async function decide(approve: boolean) {
    if (approve && emailTaken) {
      setError(
        "That email already belongs to an existing rider. Approving would move their account. Reject this application instead.",
      );
      return;
    }
    if (approve && overridden && !note.trim()) {
      setError("An override needs a note saying why.");
      return;
    }

    const composed = composeDecisionNote({
      checks,
      overridden,
      note: reviewed ? prior.note : note,
    });

    setError(null);
    await onDecide(approve, composed);
  }

  return (
    <Dialog open onClose={busy ? () => {} : onClose} title={application.fullName}>
      <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Detail label="Email">{application.applicantEmail}</Detail>
          <Detail label="Phone">{application.phone}</Detail>
          <Detail label="City">{application.city}</Detail>
          <Detail label="Vehicle">{application.vehicle}</Detail>
          <Detail label="Applied">
            {new Date(application.createdAt).toLocaleString()}
          </Detail>
          <Detail label="Waiting">
            {application.status === "pending" ? (
              <span
                className={
                  isWaitingTooLong(application.waitingDays)
                    ? "text-destructive"
                    : undefined
                }
              >
                {formatWaiting(application.createdAt)}
              </span>
            ) : (
              "—"
            )}
          </Detail>
        </dl>

        <ContactShortcuts
          name={application.fullName}
          phone={application.phone}
          email={application.applicantEmail}
        />

        {emailTaken && !reviewed ? (
          <p
            className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            An existing rider already uses {application.applicantEmail}. Approval
            would move that rider&apos;s account to this applicant and leave them
            unable to sign in.
          </p>
        ) : null}

        <section aria-label="Documents">
          <h3 className="mb-2 text-sm font-semibold text-card-foreground">
            Documents
          </h3>
          <DocumentLinks
            fields={[
              { label: "Licence", ref: application.licenceRef },
              { label: "ORCR", ref: application.orcrRef },
              { label: "Government ID", ref: application.governmentIdRef },
            ]}
          />
        </section>

        {reviewed ? (
          <section aria-label="Decision">
            <h3 className="mb-1 text-sm font-semibold text-card-foreground">
              Decision — {application.status}
            </h3>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {prior.note || "No note recorded."}
            </p>
            {prior.checks.length > 0 || prior.overridden ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {prior.checks.length > 0
                  ? `Checked: ${prior.checks
                      .map(
                        (key) =>
                          DOCUMENT_CHECKS.find((c) => c.key === key)?.label ?? key,
                      )
                      .join(", ")}.`
                  : null}
                {prior.overridden ? " Approved with an admin override." : null}
              </p>
            ) : null}
            {application.reviewedAt ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Reviewed {new Date(application.reviewedAt).toLocaleString()}
              </p>
            ) : null}
          </section>
        ) : (
          <>
            <section aria-label="Document checks">
              <h3 className="mb-1 text-sm font-semibold text-card-foreground">
                Document checks
              </h3>
              <ul className="flex flex-col gap-1.5">
                {DOCUMENT_CHECKS.map((check) => (
                  <li key={check.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`check-${check.key}`}
                      checked={checks.includes(check.key)}
                      onChange={(e) =>
                        setChecks((current) =>
                          e.target.checked
                            ? [...current, check.key]
                            : current.filter((k) => k !== check.key),
                        )
                      }
                    />
                    <label
                      htmlFor={`check-${check.key}`}
                      className="text-sm text-card-foreground"
                    >
                      {check.label}
                    </label>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex items-start gap-2">
                <Checkbox
                  id="override"
                  checked={overridden}
                  onChange={(e) => setOverridden(e.target.checked)}
                />
                <label htmlFor="override" className="text-sm text-card-foreground">
                  Approve anyway (admin override)
                </label>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Recorded in the decision note so it can be found later. Needs a
                reason.
              </p>
            </section>

            <section aria-label="Decision note">
              <label
                htmlFor="decision-note"
                className="mb-1 block text-sm font-semibold text-card-foreground"
              >
                Decision note
              </label>
              <Textarea
                id="decision-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  overridden
                    ? "Required: why are you approving without these checks?"
                    : "Shown to the applicant if you reject."
                }
              />
            </section>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => decide(false)}
                disabled={busy}
              >
                {busy ? "Saving…" : "Reject"}
              </Button>
              <Button onClick={() => decide(true)} disabled={busy}>
                {busy ? "Saving…" : "Approve"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-card-foreground">{children}</dd>
    </div>
  );
}