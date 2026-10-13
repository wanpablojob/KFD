"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  addRiderNote,
  fetchOrdersByRiderId,
  fetchRiderById,
  fetchRiderEmails,
  fetchRiderActivity,
  fetchRiderApplications,
  fetchRiderEarningsByDay,
  fetchRiderNotes,
  fetchRiderPayouts,
  fetchRiderPayoutSummary,
  setRiderArchived,
  setRiderStatus,
  setRiderAccess,
  setRiderSuspended,
  revokeRiderAccess,
  updateRiderProfile,
  fetchRiderAccess,
  resolveDeliveryIssue,
} from "@/lib/supabase/queries";
import { formatCurrency } from "@/lib/format";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/status";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArchiveButton } from "@/components/ui/archive-button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/field";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { useAsyncData } from "@/lib/use-async-data";
import { TableBoundary } from "@/components/ui/table-boundary";
import type { Rider } from "@/lib/types";
import { riderFlags } from "@/lib/rider-flags";
import { friendlyRiderSaveError } from "@/lib/rider-validation";
import { describeEvent, sortActivity } from "@/lib/rider-activity";
import { successRateLabel } from "@/lib/rider-ledger";
import type { RiderPayout } from "@/lib/rider-ledger";
import { EarningsChart } from "@/components/charts/earnings-chart";
import {
  ContactShortcuts,
  RiderFlagBadges,
  SuspendedBadge,
} from "@/components/rider/rider-row-bits";
import { SuspendRiderDialog } from "@/components/rider/suspend-rider-dialog";
import { EditRiderDialog } from "@/components/rider/edit-rider-dialog";
import { deliveryColumns } from "@/components/riders/delivery-columns";
import { buildPayoutColumns } from "@/components/riders/payout-columns";
import { EntityDialog } from "@/components/ui/entity-dialog";
import { useRiderAction } from "@/components/rider/use-rider-action";
import { RevokeRiderDialog } from "@/components/riders/revoke-rider-dialog";
import { ResolveDisputeDialog } from "@/components/riders/resolve-dispute-dialog";

/** Chart window. A month is long enough to spot a decline without paging. */
const WINDOW_DAYS = 30;
/** Server-side page size for the delivery history. The pager asks for more. */
const DELIVERY_PAGE_SIZE = 25;

export default function RiderDetailPage() {
  const params = useParams();
  const riderId = params.id as string;

  // Every fetcher here closes over `riderId` and nothing else, and each is keyed
  // by it. The page previously derived the rider's name from a second query and
  // asked for orders by that name -- which useAsyncData could not recover from,
  // because it captures its fetcher once on mount, so the orders query ran
  // before the name existed and went out with "".
  // Server-side paging. The delivery history is paginated in SQL rather than
  // sliced in the browser, so a rider with hundreds of deliveries does not pull
  // all of them to show the first page.
  const [deliveryPage, setDeliveryPage] = useState(1);

  const riderQuery = useAsyncData(() => fetchRiderById(riderId), riderId);
  const orders = useAsyncData(
    () =>
      fetchOrdersByRiderId(riderId, {
        page: deliveryPage,
        limit: DELIVERY_PAGE_SIZE,
      }),
    `${riderId}:${deliveryPage}`,
  );
  const activity = useAsyncData(() => fetchRiderActivity(riderId), riderId);
  const notes = useAsyncData(() => fetchRiderNotes(riderId), riderId);
  // Only to find this rider's own application. There is no rider_id on
  // rider_applications -- the link is the auth user, so this matches on
  // applicantUserId rather than needing a join column.
  const applications = useAsyncData(() => fetchRiderApplications(), riderId);
  const emails = useAsyncData(() => fetchRiderEmails(), riderId);
  const access = useAsyncData(() => fetchRiderAccess(), riderId);
  // This rider's own account row, read from the same fleet-wide list rather than
  // from riders.user_id: the list already resolves the email and knows whether an
  // account is attached, which is what the revoke flow needs.
  const account = (access.data ?? []).find((row) => row.riderId === riderId);
  // The ledger is the source of truth for money. Needs migration 0058 (admin_rider_payout_summary).
  const payoutSummary = useAsyncData(
    () => fetchRiderPayoutSummary(riderId),
    riderId,
  );
  const payouts = useAsyncData(() => fetchRiderPayouts(riderId), riderId);

  const earnings = useAsyncData(
    () =>
      fetchRiderEarningsByDay(
        riderId,
        new Date(Date.now() - WINDOW_DAYS * 86_400_000),
        new Date(),
      ),
    riderId,
  );

  const [editing, setEditing] = useState(false);
  const [suspending, setSuspending] = useState<"suspend" | "reinstate" | null>(
    null,
  );
  const [attaching, setAttaching] = useState(false);
  const [revoking, setRevoking] = useState(false);
  // The payout row whose dispute is being resolved, if any. Holds the row rather
  // than a boolean so the dialog can name the order and show the amount at stake.
  const [resolving, setResolving] = useState<RiderPayout | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  // Status, archive and suspension all go through here, so a rejected write
  // shows its message rather than becoming an unhandled rejection and leaving
  // the control looking like it worked.
  const action = useRiderAction();
  const statusBusy = action.isPending("status");

  const loading = riderQuery.loading;
  const error = riderQuery.error;
  const rider = riderQuery.data;

  if (loading) {
    return (
      <PageContainer>
        <PageHeader title="Loading…" />
      </PageContainer>
    );
  }

  // A failed fetch would otherwise fall through to "Rider not found", which
  // reads as a deleted rider rather than a network or RLS problem.
  if (error) {
    return (
      <PageContainer>
        <PageHeader title="Could not load this rider" description={error} />
      </PageContainer>
    );
  }

  if (!rider) {
    return (
      <PageContainer>
        <PageHeader
          title="Rider not found"
          description="The requested rider does not exist."
        />
      </PageContainer>
    );
  }

  // A rider who has been given work is worth understanding: what they could not
  // deliver and why. The reason is rider-typed free text stored on the order
  // (migration 0044) and deliberately kept after the order is reassigned.
  const failedDeliveries = (orders.data?.rows ?? []).filter(
    (order) => order.deliveryFailedReason !== null,
  );

  // A rider with no linked auth account never applied through the app, so there
  // is nothing to link to rather than something that failed to load.
  const application = rider.userId
    ? (applications.data ?? []).find(
        (candidate) => candidate.applicantUserId === rider.userId,
      )
    : undefined;

  // The newest order still in flight. Derived from the history already loaded,
  // which is ordered by placed_at desc -- so the first non-terminal row is the
  // live one.
  const currentJob = (orders.data?.rows ?? []).find(
    (order) => !["delivered", "cancelled"].includes(order.status),
  );

  const summary = payoutSummary.data;
  const rateLabel = successRateLabel({
    deliveredCount: summary?.deliveredCount ?? 0,
    failedCount: summary?.failedCount ?? 0,
  });

  const events = sortActivity(activity.data ?? []);
  // deliveredCount / failedCount come from the same payout summary the cards
  // above use, not from zero. Passing zero made hasHighFailureRate() always
  // false, so this page could never show the "High failures" flag the list page
  // shows for the same rider.
  const flags = riderFlags({
    rating: rider.rating,
    deliveredCount: summary?.deliveredCount ?? 0,
    failedCount: summary?.failedCount ?? 0,
    hasAccount: rider.userId !== null,
  });
  const payoutColumns = buildPayoutColumns({ onResolve: setResolving });

  async function addNote() {
    const body = noteBody.trim();
    // Trimmed before the request: admin_add_rider_note() truncates at 2000
    // characters server-side, and an all-whitespace note is not worth a row.
    if (!body) return;
    setNoteBusy(true);
    setNoteError(null);
    try {
      await addRiderNote(riderId, body);
      setNoteBody("");
      // The note write also raises rider.note_added, so both panels are stale.
      notes.refetch();
      activity.refetch();
    } catch (cause) {
      setNoteError(
        cause instanceof Error ? cause.message : "Could not save the note.",
      );
    } finally {
      setNoteBusy(false);
    }
  }

  async function suspend(reason: string) {
    const suspendingNow = suspending === "suspend";
    await action.run("suspend", async () => {
      await setRiderSuspended(riderId, suspendingNow, reason);
      riderQuery.refetch();
      activity.refetch();
      setSuspending(null);
    });
  }

  /**
   * Release or reverse a disputed payout (0075).
   *
   * A reversal recomputes the rider's deliveries and earnings from the ledger,
   * so the summary cards and the header totals are stale too, not just the
   * payout table. Releasing changes no total, but refetching both is one branch
   * fewer and the read is cheap.
   */
  async function resolveDispute(
    decision: "release" | "reverse",
    note: string,
  ) {
    if (!resolving) return;
    await action.run("resolve", async () => {
      await resolveDeliveryIssue(resolving.orderId, decision, note);
      await payouts.refetch();
      await payoutSummary.refetch();
      await riderQuery.refetch();
      activity.refetch();
      setResolving(null);
    });
  }

  return (
    <PageContainer>
      <PageHeader
        title={rider.name}
        description={rider.email}
        actions={
          <span className="flex items-center gap-2">
            <Link href="/dashboard/riders">
              <Button variant="outline" size="sm">
                <ArrowLeftIcon className="h-4 w-4" />
                Back to Riders
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setSuspending(rider.suspendedAt ? "reinstate" : "suspend")
              }
            >
              {rider.suspendedAt ? "Reinstate" : "Suspend"}
            </Button>
            <ArchiveButton
              name={rider.name}
              archived={Boolean(rider.archivedAt)}
              onChange={(archived) =>
                action
                  .run(
                    "archive",
                    async () => {
                      await setRiderArchived(riderId, archived);
                      riderQuery.refetch();
                    },
                    { rethrow: true },
                  )
                  .then(() => undefined)
              }
            />
          </span>
        }
      />

      <Section aria-label="Rider details">
        <Card className="mb-6">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <Avatar name={rider.name} size="lg" />
            <div className="space-y-1">
              <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-card-foreground">
                {rider.name}
                <StatusBadge status={rider.status} />
                {rider.archivedAt ? (
                  <Badge variant="secondary" size="sm">
                    Archived
                  </Badge>
                ) : null}
                <SuspendedBadge
                  suspendedAt={rider.suspendedAt ?? null}
                  reason={rider.suspendedReason ?? null}
                />
              </p>
              <p className="text-muted-foreground">{rider.email}</p>
              <p className="text-sm text-muted-foreground">
                {rider.phone} · {rider.city} · {rider.vehicle}
              </p>
              {flags.length > 0 ? (
                <RiderFlagBadges flags={flags} riderName={rider.name} />
              ) : null}
            </div>
            <div className="ml-auto flex flex-col items-start gap-2 sm:items-end">
              {currentJob ? (
                <Link
                  href={`/dashboard/orders?order=${currentJob.reference}`}
                  className="text-sm text-card-foreground underline underline-offset-2"
                >
                  On {currentJob.reference}
                </Link>
              ) : (
                <span className="text-sm text-muted-foreground">
                  No active job
                </span>
              )}
              <ContactShortcuts
                name={rider.name}
                phone={rider.phone}
                email={rider.email}
              />
              {rider.archivedAt || rider.suspendedAt ? null : (
                <Select
                  value={rider.status}
                  aria-label={`Set status for ${rider.name}`}
                  className="h-8 w-32"
                  disabled={statusBusy}
                  onChange={(e) => {
                    const next = e.target.value as Rider["status"];
                    void action.run("status", async () => {
                      await setRiderStatus(riderId, next);
                      riderQuery.refetch();
                      activity.refetch();
                    });
                  }}
                >
                  <option value="online">Online</option>
                  <option value="busy">Busy</option>
                  <option value="offline">Offline</option>
                </Select>
              )}
            </div>
          </div>
        </Card>

        {action.error ? (
          <p className="mb-6 text-sm text-destructive" role="alert">
            {action.error}
          </p>
        ) : null}

        {/* Every peso here is the ledger, not orders.total and not the
            denormalised riders.earnings counter. See lib/rider-ledger.ts. */}
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            kpi={{
              label: "Earned today",
              value: formatCurrency(summary?.earnedToday ?? 0),
              hint: "Manila day",
            }}
          />
          <StatCard
            kpi={{
              label: "Earned this week",
              value: formatCurrency(summary?.earnedWeek ?? 0),
              hint: "Last 7 days",
            }}
          />
          <StatCard
            kpi={{
              label: "Lifetime earned",
              value: formatCurrency(summary?.lifetime ?? 0),
              hint: `${summary?.deliveredCount ?? 0} deliveries completed`,
            }}
          />
          <StatCard
            kpi={{
              label: "Rating",
              value: `${rider.rating} ★`,
              hint: rateLabel,
            }}
          />
        </div>
      </Section>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="px-5 pt-5">
            <h2 className="text-sm font-semibold text-card-foreground">
              Earnings, last {WINDOW_DAYS} days
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Payouts recorded in the earnings ledger.
            </p>
          </div>
          <TableBoundary
            loading={earnings.loading}
            error={earnings.error}
            onRetry={earnings.refetch}
            errorTitle="Could not load earnings"
            skeletonRows={1}
          >
            <EarningsChart data={earnings.data ?? []} />
          </TableBoundary>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-5 pt-5">
            <h2 className="text-sm font-semibold text-card-foreground">
              Internal notes
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Admins only. Riders never see these.
            </p>
          </div>
          <div className="flex flex-col gap-4 p-5">
            <div>
              <Label htmlFor="rider-note">Add a note</Label>
              <Textarea
                id="rider-note"
                rows={3}
                value={noteBody}
                maxLength={2000}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Called about the two failed deliveries; will retry tomorrow."
              />
              {noteError ? (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  {noteError}
                </p>
              ) : null}
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  onClick={addNote}
                  disabled={noteBusy || !noteBody.trim()}
                >
                  {noteBusy ? "Saving…" : "Save note"}
                </Button>
              </div>
            </div>

            <TableBoundary
              loading={notes.loading}
              error={notes.error}
              onRetry={notes.refetch}
              errorTitle="Could not load notes"
              skeletonRows={2}
            >
              {(notes.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {(notes.data ?? []).map((note) => (
                    <li
                      key={note.id}
                      className="rounded-lg border border-border p-3"
                    >
                      <p className="whitespace-pre-wrap text-sm text-card-foreground">
                        {note.body}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {note.authorEmail ?? "unknown"} ·{" "}
                        {new Date(note.createdAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </TableBoundary>
          </div>
        </Card>
      </div>

      <Section aria-label="Activity" className="mb-8">
        <Card>
          <div className="px-5 pt-5">
            <h2 className="text-sm font-semibold text-card-foreground">
              Activity
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Status changes, suspension, account access and notes, newest
              first.
            </p>
          </div>
          <div className="p-5 pt-4">
            <TableBoundary
              loading={activity.loading}
              error={activity.error}
              onRetry={activity.refetch}
              errorTitle="Could not load activity"
              skeletonRows={3}
            >
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing recorded for this rider yet.
                </p>
              ) : (
                <ol className="flex flex-col">
                  {events.map((event, index) => {
                    const described = describeEvent(event);
                    return (
                      <li key={event.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                              described.tone === "warning"
                                ? "bg-destructive"
                                : "bg-primary"
                            }`}
                          />
                          {index < events.length - 1 ? (
                            <span className="w-px flex-1 bg-border" />
                          ) : null}
                        </div>
                        <div className="pb-4">
                          <p className="text-sm font-medium text-card-foreground">
                            {described.label}
                          </p>
                          {described.detail ? (
                            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                              {described.detail}
                            </p>
                          ) : null}
                          <p className="text-xs text-muted-foreground">
                            {new Date(event.changedAt).toLocaleString()} ·{" "}
                            {event.actorEmail ?? "system"}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </TableBoundary>
          </div>
        </Card>
      </Section>

      <Section aria-label="Payout history" className="mb-8">
        <Card className="overflow-hidden">
          <div className="p-5">
            <h2 className="text-sm font-semibold text-card-foreground">
              Payout history
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              One row per completed delivery, from the earnings ledger. The
              amount was frozen when the order was claimed, so it does not move
              if the fee changes later. Each payout stays reviewable for 24
              hours after the delivery; a disputed one is held until an admin
              resolves it.
            </p>
          </div>
          <TableBoundary
            loading={payouts.loading}
            error={payouts.error}
            onRetry={payouts.refetch}
            errorTitle="Could not load the payout ledger"
            skeletonRows={3}
            skeletonColumns={4}
          >
            {(payouts.data ?? []).length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState
                  title="No payouts recorded"
                  description="The ledger starts at this rider's first delivery completed since it existed. Older deliveries have no recorded payout and are left out rather than guessed at."
                />
              </div>
            ) : (
              <DataTable columns={payoutColumns} rows={payouts.data ?? []} />
            )}
          </TableBoundary>
        </Card>
      </Section>

      <Section aria-label="Application" className="mb-8">
        <Card>
          <div className="p-5">
            <h2 className="text-sm font-semibold text-card-foreground">
              Application
            </h2>
            {application ? (
              <div className="mt-2 flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  {application.vehicle} · {application.city} · applied{" "}
                  {new Date(application.createdAt).toLocaleDateString()}
                </p>
                {/* The refs are whatever the applicant typed -- there is no upload
                    bucket in this project -- so they are shown as text, never as a
                    link. See rider-applications.ts for why a value that parses as
                    a URL still may not be rendered as one. */}
                <dl className="flex flex-col gap-1 text-sm">
                  {(
                    [
                      ["Licence", application.licenceRef],
                      ["ORCR", application.orcrRef],
                      ["Government ID", application.governmentIdRef],
                    ] as const
                  ).map(([label, ref]) => (
                    <div key={label}>
                      <dt className="inline text-muted-foreground">
                        {label}:{" "}
                      </dt>
                      <dd className="inline font-mono text-card-foreground">
                        {ref || "not supplied"}
                      </dd>
                    </div>
                  ))}
                </dl>
                {application.decisionNote ? (
                  <p className="whitespace-pre-wrap text-sm text-card-foreground">
                    {application.decisionNote}
                  </p>
                ) : null}
                <Link
                  href="/dashboard/riders"
                  className="text-sm text-primary underline underline-offset-2"
                >
                  Open the application queue
                </Link>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {rider.userId
                  ? "No application on file for this account. This rider was added directly."
                  : "This rider is not linked to an account, so they never applied through the app."}
              </p>
            )}
          </div>
        </Card>
      </Section>

      <Section aria-label="Linked account" className="mb-8">
        <Card>
          <div className="p-5">
            <h2 className="text-sm font-semibold text-card-foreground">
              Rider app access
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              The auth account this rider signs in with. Attaching one is what
              lets them open the rider app; without it they are a row with no
              way in.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {account?.userId ? (
                <>
                  <span className="font-medium text-card-foreground">
                    {account.email}
                  </span>
                  <Badge variant="secondary" size="sm">
                    Can sign in
                  </Badge>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">
                    No account linked — this rider cannot sign in to the rider
                    app.
                  </span>
                  <Badge variant="secondary" size="sm">
                    No access
                  </Badge>
                </>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAttaching(true)}
                disabled={action.pendingKey !== null}
              >
                {account?.userId ? "Reassign account" : "Attach account"}
              </Button>
              {account?.userId ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRevoking(true)}
                  disabled={action.pendingKey !== null}
                >
                  Revoke access
                </Button>
              ) : null}
            </div>
          </div>
        </Card>
      </Section>

      <Section aria-label="Failed deliveries" className="mb-8">
        <Card>
          <div className="p-5">
            <h2 className="text-sm font-semibold text-card-foreground">
              Failed deliveries
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Reported by this rider in the app. Kept after the order is
              reassigned.
            </p>
            {failedDeliveries.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                None reported.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {failedDeliveries.map((order) => (
                  <li
                    key={order.id}
                    className="flex flex-wrap items-baseline gap-x-3 rounded-lg border border-border p-3"
                  >
                    <Link
                      href={`/dashboard/orders?order=${order.reference}`}
                      className="text-sm font-medium text-card-foreground underline underline-offset-2"
                    >
                      {order.reference}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {order.restaurant} ·{" "}
                      {order.deliveryFailedAt
                        ? new Date(order.deliveryFailedAt).toLocaleString()
                        : "date not recorded"}
                    </span>
                    <span className="w-full text-sm text-card-foreground">
                      {order.deliveryFailedReason}
                    </span>
                    {/* delivery_failed_by is riders.id, not a name, and it
                        survives reassignment on purpose -- this page is showing
                        the rider who reported it, which is this rider by
                        construction. A mismatch would mean the order belongs in
                        another rider's list, so it is stated rather than
                        assumed. */}
                    {order.deliveryFailedBy &&
                    order.deliveryFailedBy !== riderId ? (
                      <span className="w-full text-xs text-muted-foreground">
                        Reported by rider {order.deliveryFailedBy}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </Section>

      <Section aria-label="Delivery history">
        <TableBoundary
          loading={orders.loading}
          error={orders.error}
          onRetry={orders.refetch}
          errorTitle="Could not load delivery history"
          skeletonRows={5}
          skeletonColumns={7}
        >
          <Card className="overflow-hidden">
            {(orders.data?.rows.length ?? 0) === 0 ? (
              <EmptyState
                title="No deliveries found"
                description="This rider has not been assigned any orders."
              />
            ) : (
              <>
                <DataTable
                  columns={deliveryColumns}
                  rows={orders.data?.rows ?? []}
                />
                {orders.data && orders.data.total !== null ? (
                  <Pagination
                    page={deliveryPage}
                    pageSize={DELIVERY_PAGE_SIZE}
                    total={orders.data.total}
                    onPageChange={setDeliveryPage}
                  />
                ) : null}
              </>
            )}
          </Card>
        </TableBoundary>
      </Section>

      {editing ? (
        <EditRiderDialog
          rider={rider}
          existingEmails={(emails.data ?? [])
            .filter((row) => row.id !== riderId)
            .map((row) => row.email)}
          onClose={() => setEditing(false)}
          onSave={async (values) => {
            action.clearError();
            try {
              // Profile fields only. Status is a separate control on this page
              // because it decides dispatch availability, and deliveries /
              // earnings / rating belong to the database -- sending the values
              // this page happened to load would roll back whatever was written
              // while the dialog was open.
              await updateRiderProfile(riderId, {
                name: values.name,
                email: values.email,
                phone: values.phone,
                city: values.city,
                vehicle: values.vehicle as Rider["vehicle"],
              });
            } catch (cause) {
              throw new Error(
                friendlyRiderSaveError(cause) ??
                  (cause instanceof Error ? cause.message : "Could not save."),
              );
            }
            riderQuery.refetch();
            activity.refetch();
            setEditing(false);
          }}
        />
      ) : null}

      {attaching ? (
        <EntityDialog
          open
          key={`attach-${riderId}`}
          title={`Attach account to ${rider.name}`}
          description="If the account already rides for someone else, it moves here and the other rider keeps their delivery history. The account has to exist in Supabase Auth already."
          onClose={() => setAttaching(false)}
          initial={{ email: account?.email ?? "" }}
          fields={[
            {
              key: "email",
              label: "Account email",
              type: "text",
              required: true,
              placeholder: "rider@example.com",
            },
          ]}
          onSave={async (values) => {
            await action.run(
              "attach",
              async () => {
                await setRiderAccess(values.email.trim(), riderId);
                await access.refetch();
                await riderQuery.refetch();
                setAttaching(false);
              },
              { rethrow: true },
            );
          }}
        />
      ) : null}

      {revoking && account?.userId ? (
        <RevokeRiderDialog
          email={account.email}
          riderName={rider.name}
          busy={action.isPending("revoke")}
          onClose={() => setRevoking(false)}
          onConfirm={() =>
            action
              .run("revoke", async () => {
                await revokeRiderAccess(account.email);
                await access.refetch();
                await riderQuery.refetch();
                setRevoking(false);
              })
              .then(() => undefined)
          }
        />
      ) : null}

      {suspending ? (
        <SuspendRiderDialog
          riderName={rider.name}
          suspending={suspending === "suspend"}
          busy={action.isPending("suspend")}
          onClose={() => setSuspending(null)}
          onConfirm={suspend}
        />
      ) : null}

      {resolving ? (
        <ResolveDisputeDialog
          reference={resolving.reference}
          riderName={rider.name}
          amount={resolving.amount}
          reason={resolving.disputeReason}
          reviewExpiresAt={resolving.reviewExpiresAt}
          busy={action.isPending("resolve")}
          onClose={() => setResolving(null)}
          onResolve={resolveDispute}
        />
      ) : null}
    </PageContainer>
  );
}
