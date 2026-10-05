"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  addRiderNote,
  fetchOrdersByRider,
  fetchRiderActivity,
  fetchRiderEarningsByDay,
  fetchRiderNotes,
  fetchRiderOverview,
  setRiderArchived,
  setRiderStatus,
  setRiderSuspended,
  upsertRider,
} from "@/lib/supabase/queries";
import { formatCurrency } from "@/lib/format";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { PaginatedDataTable } from "@/components/ui/paginated-data-table";
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
import type { Order, Rider } from "@/lib/types";
import { riderFlags } from "@/lib/rider-flags";
import { friendlyRiderSaveError } from "@/lib/rider-validation";
import { describeEvent, sortActivity } from "@/lib/rider-activity";
import { EarningsChart } from "@/components/charts/earnings-chart";
import {
  ContactShortcuts,
  RiderFlagBadges,
  SuspendedBadge,
} from "@/components/rider/rider-row-bits";
import { SuspendRiderDialog } from "@/components/rider/suspend-rider-dialog";
import { EditRiderDialog } from "@/components/rider/edit-rider-dialog";

const columns: Column<Order>[] = [
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

/** Chart window. A month is long enough to spot a decline without paging. */
const WINDOW_DAYS = 30;

export default function RiderDetailPage() {
  const params = useParams();
  const riderId = params.id as string;

  const overview = useAsyncData(() => fetchRiderOverview());
  const rider = overview.data?.find((r) => r.id === riderId) ?? null;

  const orders = useAsyncData(() =>
    fetchOrdersByRider(overview.data?.find((r) => r.id === riderId)?.name ?? ""),
  );
  const activity = useAsyncData(() => fetchRiderActivity(riderId));
  const notes = useAsyncData(() => fetchRiderNotes(riderId));

  const now = new Date();
  const earnings = useAsyncData(() =>
    fetchRiderEarningsByDay(
      riderId,
      new Date(now.getTime() - WINDOW_DAYS * 86_400_000),
      now,
    ),
  );

  const [editing, setEditing] = useState(false);
  const [suspending, setSuspending] = useState<"suspend" | "reinstate" | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loading = overview.loading;
  const error = overview.error;

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

  const events = sortActivity(activity.data ?? []);
  const flags = riderFlags({
    rating: rider.rating,
    deliveredCount: rider.deliveredCount,
    failedCount: rider.failedCount,
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
      overview.refetch();
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
                overview.refetch();
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
              {rider.currentOrderReference ? (
                <Link
                  href={`/dashboard/orders?order=${rider.currentOrderReference}`}
                  className="text-sm text-card-foreground underline underline-offset-2"
                >
                  On {rider.currentOrderReference}
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
                    overview.refetch();
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

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            kpi={{ label: "Deliveries", value: String(rider.deliveries), hint: `${rider.deliveredCount} delivered` }}
          />
          <StatCard
            kpi={{ label: "Rating", value: `${rider.rating} ★`, hint: `${rider.failedCount} failed` }}
          />
          <StatCard
            kpi={{
              label: "Earnings this week",
              value: formatCurrency(rider.weekEarnings),
              hint: "Since Monday",
            }}
          />
          <StatCard
            kpi={{ label: "Total earnings", value: formatCurrency(rider.earnings), hint: "All time" }}
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
            <PaginatedDataTable<Order>
              columns={columns}
              rows={orders.data ?? []}
              searchFields={["reference", "customer", "restaurant", "status", "payment"]}
              emptyTitle="No deliveries found"
              emptyDescription="This rider has not completed any deliveries yet."
              exportName={`rider-${rider.name}-deliveries`}
              exportColumns={[
                { key: "reference", header: "Reference" },
                { key: "customer", header: "Customer" },
                { key: "restaurant", header: "Restaurant" },
                { key: "total", header: "Total", format: (row) => formatCurrency(row.total) },
                { key: "status", header: "Status" },
                { key: "payment", header: "Payment" },
                { key: "placedAt", header: "Placed" },
              ]}
            />
          </Card>
        </TableBoundary>
      </Section>

      {editing ? (
        <EditRiderDialog
          rider={rider}
          existingEmails={(overview.data ?? [])
            .filter((row) => row.id !== riderId)
            .map((row) => row.email)}
          onClose={() => setEditing(false)}
          onSave={async (values) => {
            setActionError(null);
            try {
              await upsertRider(
                {
                  name: values.name,
                  email: values.email,
                  phone: values.phone,
                  city: values.city,
                  vehicle: values.vehicle as Rider["vehicle"],
                  status: values.status as Rider["status"],
                  deliveries: rider.deliveries,
                  rating: rider.rating,
                  earnings: rider.earnings,
                },
                riderId,
              );
            } catch (cause) {
              throw new Error(
                friendlyRiderSaveError(cause) ??
                  (cause instanceof Error ? cause.message : "Could not save."),
              );
            }
            overview.refetch();
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