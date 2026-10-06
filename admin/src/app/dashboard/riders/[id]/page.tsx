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
  setRiderSuspended,
  updateRiderProfile,
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
import type { Column } from "@/components/ui/data-table";
import type { Rider } from "@/lib/types";
import type { RiderPayout } from "@/lib/rider-ledger";
import type { RiderDelivery } from "@/lib/rider-orders";
import { riderFlags } from "@/lib/rider-flags";
import { friendlyRiderSaveError } from "@/lib/rider-validation";
import { describeEvent, sortActivity } from "@/lib/rider-activity";
import { successRateLabel } from "@/lib/rider-ledger";
import { EarningsChart } from "@/components/charts/earnings-chart";
import {
  ContactShortcuts,
  RiderFlagBadges,
  SuspendedBadge,
} from "@/components/rider/rider-row-bits";
import { SuspendRiderDialog } from "@/components/rider/suspend-rider-dialog";
import { EditRiderDialog } from "@/components/rider/edit-rider-dialog";

const deliveryColumns: Column<RiderDelivery>[] = [
  {
    key: "reference",
    header: "Reference",
    cell: (row) => <span className="font-medium text-card-foreground">{row.reference}</span>,
  },
  {
    key: "customer",
    header: "Customer",
    cell: (row) => (
      <span className="flex items-center gap-2.5">
        <Avatar name={row.customer} size="sm" />
        <span className="text-card-foreground">{row.customer}</span>
      </span>
    ),
  },
  {
    key: "restaurant",
    header: "Restaurant",
    cell: (row) => row.restaurant,
  },
  {
    key: "total",
    header: "Total",
    align: "right",
    cell: (row) => <span className="font-medium text-card-foreground">{formatCurrency(row.total)}</span>,
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: "payment",
    header: "Payment",
    cell: (row) => (
      <Badge variant="secondary" size="sm">{row.payment.replace(/_/g, " ")}</Badge>
    ),
  },
  {
    key: "placedAt",
    header: "Placed",
    cell: (row) => <span className="whitespace-nowrap text-muted-foreground">{row.placedAt}</span>,
  },
];

/**
 * What this rider earned, per delivery.
 *
 * The ledger's own rows, not orders.total. The delivery history table further
 * down still shows total because there it means "what the customer paid", which
 * is a legitimate column of an order; here the column is money the rider earned
 * and the two were never the same number.
 */
const payoutColumns: Column<RiderPayout>[] = [
  {
    key: "earnedAt",
    header: "Earned",
    cell: (row) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {new Date(row.earnedAt).toLocaleString()}
      </span>
    ),
  },
  {
    key: "restaurant",
    header: "Restaurant",
    cell: (row) => (
      <span className="font-medium text-card-foreground">{row.restaurant}</span>
    ),
  },
  {
    key: "reference",
    header: "Order",
    cell: (row) => (
      <Link
        href={`/dashboard/orders?order=${row.reference}`}
        className="text-card-foreground underline underline-offset-2"
      >
        {row.reference}
      </Link>
    ),
  },
  {
    key: "amount",
    header: "Earned",
    align: "right",
    cell: (row) => (
      <span className="font-medium text-card-foreground">
        {formatCurrency(row.amount)}
      </span>
    ),
  },
];

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
    () => fetchOrdersByRiderId(riderId, { page: deliveryPage, limit: DELIVERY_PAGE_SIZE }),
    `${riderId}:${deliveryPage}`,
  );
  const activity = useAsyncData(() => fetchRiderActivity(riderId), riderId);
  const notes = useAsyncData(() => fetchRiderNotes(riderId), riderId);
  // Only to find this rider's own application. There is no rider_id on
  // rider_applications -- the link is the auth user, so this matches on
  // applicantUserId rather than needing a join column.
  const applications = useAsyncData(() => fetchRiderApplications(), riderId);
  const emails = useAsyncData(() => fetchRiderEmails(), riderId);
  // The ledger is the source of truth for money. Needs migration 0058.
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
  const [suspending, setSuspending] = useState<"suspend" | "reinstate" | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
        <PageHeader
          title="Could not load this rider"
          description={error}
        />
      </PageContainer>
    );
  }

  if (!rider) {
    return (
      <PageContainer>
        <PageHeader title="Rider not found" description="The requested rider does not exist." />
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
  const flags = riderFlags({
    rating: rider.rating,
    deliveredCount: 0,
    failedCount: 0,
    hasAccount: rider.userId !== null,
  });

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
      setNoteError(cause instanceof Error ? cause.message : "Could not save the note.");
    } finally {
      setNoteBusy(false);
    }
  }

  async function suspend(reason: string) {
    setActionError(null);
    try {
      await setRiderSuspended(riderId, suspending === "suspend", reason);
      riderQuery.refetch();
      activity.refetch();
      setSuspending(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not save.");
    }
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
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
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
              onChange={async (archived) => {
                await setRiderArchived(riderId, archived);
                riderQuery.refetch();
              }}
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
                <span className="text-sm text-muted-foreground">No active job</span>
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
                  onChange={async (e) => {
                    await setRiderStatus(riderId, e.target.value as Rider["status"]);
                    riderQuery.refetch();
                    activity.refetch();
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

        {actionError ? (
          <p className="mb-6 text-sm text-destructive" role="alert">
            {actionError}
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
                <p className="text-sm text-muted-foreground">
                  No notes yet.
                </p>
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
              Status changes, suspension, account access and notes, newest first.
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
              One row per completed delivery, from the earnings ledger. The amount
              was frozen when the order was claimed, so it does not move if the fee
              changes later.
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
                      <dt className="inline text-muted-foreground">{label}: </dt>
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

      <Section aria-label="Failed deliveries" className="mb-8">
        <Card>
          <div className="p-5">
            <h2 className="text-sm font-semibold text-card-foreground">
              Failed deliveries
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Reported by this rider in the app. Kept after the order is reassigned.
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
                <DataTable columns={deliveryColumns} rows={orders.data?.rows ?? []} />
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
            setActionError(null);
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

      {suspending ? (
        <SuspendRiderDialog
          riderName={rider.name}
          suspending={suspending === "suspend"}
          busy={false}
          onClose={() => setSuspending(null)}
          onConfirm={suspend}
        />
      ) : null}
    </PageContainer>
  );
}