"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  fetchRiderAccess,
  fetchRiderApplications,
  fetchRiderOverview,
  fetchDisputedPayouts,
  resolveDeliveryIssue,
  settleExpiredPayouts,
  reviewRiderApplication,
  revokeRiderAccess,
  setRiderAccess,
  setRiderSuspended,
  createRider,
  type RiderAccess,
  type RiderApplication,
} from "@/lib/supabase/queries";
import type { DisputedPayout } from "@/lib/rider-ledger";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { PlusIcon } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import {
  RiderInsightPanels,
  RiderSummaryCards,
} from "@/components/rider/rider-summary";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/status";
import { PaginatedDataTable } from "@/components/ui/paginated-data-table";
import { EntityDialog } from "@/components/ui/entity-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/field";
import { useAsyncData } from "@/lib/use-async-data";
import { TableBoundary } from "@/components/ui/table-boundary";
import type { Rider, RiderOverview } from "@/lib/types";
import { useRiderListView } from "@/lib/use-rider-list-view";
import {
  compareRiders,
  facetValues,
  matchesRiderFacets,
  type RiderFilter,
} from "@/lib/rider-list-params";
import { friendlyRiderSaveError } from "@/lib/rider-validation";
import { SuspendRiderDialog } from "@/components/rider/suspend-rider-dialog";
import { useRiderAction } from "@/components/rider/use-rider-action";
import { RevokeRiderDialog } from "@/components/riders/revoke-rider-dialog";
import { RiderMobileCard } from "@/components/riders/rider-mobile-card";
import { buildRiderColumns } from "@/components/riders/rider-columns";
import { buildApplicationColumns } from "@/components/riders/application-columns";
import { RiderFormDialog } from "@/components/riders/add-rider-dialog";
import { ReviewApplicationDialog } from "@/components/riders/review-application-dialog";
import { ResolveDisputeDialog } from "@/components/riders/resolve-dispute-dialog";
import { formatCurrency } from "@/lib/format";
import { reviewWindowRemaining } from "@/lib/rider-ledger";

/** Keys for useRiderAction, so two rows never share a pending state. */
const statusKey = (riderId: string) => `status:${riderId}`;
const archiveKey = (riderId: string) => `archive:${riderId}`;

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
  // The fleet-wide dispute queue (0075). Settling elapsed windows first is the
  // same trick the RPC's own doc describes: there is no scheduler, and a row
  // whose 24 hours are up should not appear as work waiting on a person. The
  // sweep is best-effort -- if it fails, the queue below still reports what is
  // genuinely disputed, and that read surfaces the migration gap itself.
  const disputes = useAsyncData(async () => {
    await settleExpiredPayouts().catch(() => undefined);
    return fetchDisputedPayouts();
  });
  const { params, set } = useRiderListView();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [resolvingDispute, setResolvingDispute] = useState<DisputedPayout | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  // The queue was one undifferentiated table: pending and long-settled
  // applications in a single chronology, so the thing that needs a decision was
  // buried under whatever arrived last.
  const [applicationFilter, setApplicationFilter] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("pending");
  // Per-row status writes and archive writes go through here, so a rejected
  // write shows its message instead of vanishing into an unhandled rejection.
  const action = useRiderAction();

  /**
   * One runner for every mutation, because each of them has the same three
   * obligations: show a spinner, surface the database's message rather than a
   * generic failure, and re-read whichever lists the change touched. Approving
   * an application creates a rider row this page has never seen, which is why
   * this refetches the overview instead of patching a row locally.
   */
  async function run(
    write: () => Promise<void>,
    success?: string,
  ): Promise<void> {
    setBusy(true);
    action.clearError();
    setActionNotice(null);
    try {
      await write();
      if (success) setActionNotice(success);
    } catch (cause) {
      action.run("report", async () => {
        throw cause;
      });
      // Re-thrown: the caller keeps its dialog open, because closing it would
      // throw away the reason an admin typed into the suspension field.
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  /**
   * Release or reverse one disputed payout. A reversal recomputes the rider's
   * deliveries and earnings from the ledger, so the fleet list is refetched
   * alongside the queue rather than only the queue.
   */
  async function resolveDispute(
    decision: "release" | "reverse",
    note: string,
  ) {
    if (!resolvingDispute) return;
    await action.run(`dispute:${resolvingDispute.orderId}`, async () => {
      await resolveDeliveryIssue(resolvingDispute.orderId, decision, note);
      await Promise.all([disputes.refetch(), overview.refetch()]);
      setResolvingDispute(null);
    });
  }

  const allRiders = overview.data ?? [];
  const existingEmails = allRiders.map((rider) => rider.email);
  const accountByRiderId = new Map(
    (access.data ?? []).map((row) => [row.riderId, row]),
  );
  const riderColumns = buildRiderColumns({
    onSuspend: (rider) => setMode({ kind: "suspend", rider }),
    onReinstate: (rider) => setMode({ kind: "reinstate", rider }),
    onAttach: (row) => setMode({ kind: "reassign", row }),
    onRevoke: (row) => setMode({ kind: "revoke", row }),
    onChanged: async () => {
      await overview.refetch();
      await access.refetch();
    },
    accounts: accountByRiderId,
    isPending: action.isPending,
    statusKey,
    archiveKey,
    runAction: action.run,
  });
  const applicationColumns = buildApplicationColumns((row) =>
    setMode({ kind: "review", row }),
  );
  const cities = facetValues(allRiders, "city");
  const vehicles = facetValues(allRiders, "vehicle");

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
    .filter((rider) => matchesRiderFacets(rider, params))
    .sort((a, b) =>
      compareRiders(
        a as unknown as Record<string, unknown>,
        b as unknown as Record<string, unknown>,
        params.sort,
        params.dir,
      ),
    );



  const allApplications = applications.data ?? [];
  const pendingCount = allApplications.filter((a) => a.status === "pending").length;
  const visibleApplications = allApplications.filter(
    (a) => applicationFilter === "all" || a.status === applicationFilter,
  );


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
        pendingApplications={pendingCount}
        onFilterChange={(next: RiderFilter) => set({ filter: next })}
      />
      <RiderInsightPanels rows={allRiders} />

      {(disputes.data ?? []).length > 0 ? (
        <Section aria-label="Payout disputes" className="mt-6">
          <Card>
            <div className="p-5">
              <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-card-foreground">
                Payout disputes
                <Badge variant="destructive" size="sm">
                  {disputes.data?.length} open
                </Badge>
              </h2>
              <p className="mb-3 text-sm text-muted-foreground">
                A customer or merchant reported a problem with a completed
                delivery, so the rider&apos;s payout for it is held. Releasing
                pays the rider; reversing takes it back. An unresolved dispute
                settles automatically when its review window closes.
              </p>
              <ul className="flex flex-col gap-2">
                {(disputes.data ?? []).map((dispute) => (
                  <li
                    key={dispute.orderId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border p-3"
                  >
                    <Link
                      href={`/dashboard/orders?order=${dispute.reference}`}
                      className="text-sm font-medium text-card-foreground underline underline-offset-2"
                    >
                      {dispute.reference}
                    </Link>
                    <Link
                      href={`/dashboard/riders/${dispute.riderId}`}
                      className="text-sm text-card-foreground underline-offset-2 hover:underline"
                    >
                      {dispute.riderName}
                    </Link>
                    <span className="text-sm font-medium text-card-foreground">
                      {formatCurrency(dispute.amount)}
                    </span>
                    {dispute.reviewExpiresAt ? (
                      <span className="text-xs text-muted-foreground">
                        {reviewWindowRemaining(dispute.reviewExpiresAt)}
                      </span>
                    ) : null}
                    <span className="w-full text-sm text-muted-foreground">
                      {dispute.reason ?? "No reason recorded."}
                    </span>
                    <span className="ml-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={action.isPending(`dispute:${dispute.orderId}`)}
                        onClick={() => setResolvingDispute(dispute)}
                      >
                        Resolve
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </Section>
      ) : null}

      {disputes.error ? (
        // Not silent: this read needs migration 0075, and hiding the panel when
        // the RPC is missing would leave an admin with no disputes and no reason.
        <p className="mt-3 text-sm text-destructive" role="alert">
          {disputes.error}
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="rider-city" className="text-xs text-muted-foreground">
            City
          </Label>
          <Select
            id="rider-city"
            value={params.city}
            aria-label="Filter riders by city"
            className="mt-1 h-9 w-44"
            onChange={(e) => set({ city: e.target.value })}
          >
            <option value="">All cities</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="rider-vehicle" className="text-xs text-muted-foreground">
            Vehicle
          </Label>
          <Select
            id="rider-vehicle"
            value={params.vehicle}
            aria-label="Filter riders by vehicle"
            className="mt-1 h-9 w-44"
            onChange={(e) => set({ vehicle: e.target.value })}
          >
            <option value="">All vehicles</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle} value={vehicle}>
                {vehicle}
              </option>
            ))}
          </Select>
        </div>
        {params.city || params.vehicle ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => set({ city: "", vehicle: "" })}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

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
                // Matches the on-screen header. It is riders.earnings, which is
                // the ledger-consistent counter, not orders.total.
                { key: "earnings", header: "Total earned" },
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
      {action.error && !mode ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {action.error}
        </p>
      ) : null}

      <div id="applications">
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
            <>
              <div
                className="mb-3 flex flex-wrap gap-2"
                role="group"
                aria-label="Filter applications by status"
              >
                {(
                  [
                    ["pending", "Pending"],
                    ["approved", "Approved"],
                    ["rejected", "Rejected"],
                    ["all", "All"],
                  ] as const
                ).map(([key, label]) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={applicationFilter === key ? "primary" : "outline"}
                    aria-pressed={applicationFilter === key}
                    onClick={() => setApplicationFilter(key)}
                  >
                    {label}
                    {key === "pending" && pendingCount > 0 ? (
                      <span className="ml-1.5 opacity-70">{pendingCount}</span>
                    ) : null}
                  </Button>
                ))}
              </div>
              <Card className="overflow-hidden">
                <PaginatedDataTable<RiderApplication>
                  columns={applicationColumns}
                  rows={visibleApplications}
                  searchFields={[
                    "fullName",
                    "applicantEmail",
                    "phone",
                    "city",
                    "vehicle",
                    "decisionNote",
                  ]}
                  emptyTitle="No applications match"
                  emptyDescription="Nothing with this status right now."
                  exportName="/dashboard/riders-applications"
                  exportColumns={[
                    { key: "fullName", header: "Applicant" },
                    { key: "applicantEmail", header: "Account" },
                    { key: "phone", header: "Phone" },
                    { key: "city", header: "City" },
                    { key: "vehicle", header: "Vehicle" },
                    { key: "status", header: "Status" },
                    { key: "decisionNote", header: "Note" },
                    { key: "reviewerEmail", header: "Reviewed by" },
                    { key: "reviewedAt", header: "Reviewed" },
                    { key: "createdAt", header: "Applied" },
                  ]}
                />
              </Card>
            </>
          )}
        </TableBoundary>
      </Section>
      </div>


      {open ? (
        <RiderFormDialog
          existingEmails={existingEmails}
          onClose={() => setOpen(false)}
          onSave={async (values) => {
            await run(async () => {
              try {
                await createRider({
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

      {resolvingDispute ? (
        <ResolveDisputeDialog
          reference={resolvingDispute.reference}
          riderName={resolvingDispute.riderName}
          amount={resolvingDispute.amount}
          reason={resolvingDispute.reason}
          reviewExpiresAt={resolvingDispute.reviewExpiresAt}
          busy={action.isPending(`dispute:${resolvingDispute.orderId}`)}
          onClose={() => setResolvingDispute(null)}
          onResolve={resolveDispute}
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

