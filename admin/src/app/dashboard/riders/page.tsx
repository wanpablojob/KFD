"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  fetchRiders,
  fetchRiderAccess,
  revokeRiderAccess,
  setRiderAccess,
  setRiderArchived,
  setRiderStatus,
  upsertRider,
  type RiderAccess,
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
import { Select } from "@/components/ui/select";
import { PlusIcon } from "@/components/ui/icons";
import type { Column } from "@/components/ui/data-table";
import { useAsyncData } from "@/lib/use-async-data";
import { TableBoundary } from "@/components/ui/table-boundary";
import type { Rider } from "@/lib/types";

const baseColumns: Column<Rider>[] = [
  {
    key: "name",
    header: "Rider",
    cell: (row) => (
      <span className="flex items-center gap-2.5">
        <Avatar name={row.name} size="sm" />
        <span>
          <span className="block font-medium text-card-foreground">
            {row.name}
          </span>
          <span className="block text-xs text-muted-foreground">{row.email}</span>
        </span>
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
    key: "deliveries",
    header: "Deliveries",
    align: "right",
    cell: (row) => (
      <span className="text-card-foreground">{row.deliveries}</span>
    ),
  },
  {
    key: "rating",
    header: "Rating",
    align: "right",
    cell: (row) => (
      <span className="text-card-foreground">{row.rating} ★</span>
    ),
  },
  {
    key: "earnings",
    header: "Earnings",
    align: "right",
    cell: (row) => (
      <span className="font-medium text-card-foreground">
        {formatCurrency(row.earnings)}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => (
      <span className="flex items-center gap-1.5">
        <StatusBadge status={row.status} />
        {row.archivedAt ? (
          <Badge variant="secondary" size="sm">
            Archived
          </Badge>
        ) : null}
      </span>
    ),
  },
];

const FIELDS: DialogField[] = [
  { key: "name", label: "Name", required: true },
  { key: "email", label: "Email", required: true },
  { key: "phone", label: "Phone" },
  { key: "city", label: "City" },
  { key: "vehicle", label: "Vehicle", options: ["bicycle", "scooter", "motorcycle", "car"] },
  { key: "status", label: "Status", options: ["online", "busy", "offline"] },
];

export default function RidersPage() {
  const router = useRouter();
  const { data, loading, error, refetch } = useAsyncData(() => fetchRiders());
  const access = useAsyncData(() => fetchRiderAccess());
  const [editing, setEditing] = useState<Rider | null>(null);
  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [mode, setMode] = useState<
    | { kind: "reassign"; row: RiderAccess }
    | { kind: "revoke"; row: RiderAccess }
    | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessNotice, setAccessNotice] = useState<string | null>(null);

  async function runAccess(action: () => Promise<void>, success: string) {
    setBusy(true);
    setAccessError(null);
    setAccessNotice(null);
    try {
      await action();
      setMode(null);
      setAccessNotice(success);
      await access.refetch();
    } catch (cause) {
      setAccessError(cause instanceof Error ? cause.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const rows = (data ?? []).filter((r) => showArchived || !r.archivedAt);
  const archivedCount = (data ?? []).length - rows.length;

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

  const accessRows = access.data ?? [];

  const columns: Column<Rider>[] = [
    ...baseColumns,
    {
      key: "statusToggle",
      header: "Toggle",
      cell: (row) => (
        <Select
          value={row.status}
          aria-label={`Set status for ${row.name}`}
          className="h-8 w-32"
          onClick={(e) => e.stopPropagation()}
          onChange={async (e) => {
            await setRiderStatus(row.id, e.target.value as Rider["status"]);
            refetch();
          }}
        >
          <option value="online">Online</option>
          <option value="busy">Busy</option>
          <option value="offline">Offline</option>
        </Select>
      ),
    },
    {
      key: "archive",
      header: "",
      align: "right",
      cell: (row) => (
        <ArchiveButton
          name={row.name}
          archived={Boolean(row.archivedAt)}
          onChange={async (archived) => {
            await setRiderArchived(row.id, archived);
            refetch();
          }}
        />
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Riders"
        description="Fleet of active delivery partners."
        actions={
          <span className="flex items-center gap-2">
            {archivedCount > 0 ? (
              <Button
                variant="outline"
                aria-pressed={showArchived}
                onClick={() => setShowArchived((v) => !v)}
              >
                {showArchived
                  ? "Hide archived"
                  : `Show archived (${archivedCount})`}
              </Button>
            ) : null}
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <PlusIcon className="h-4 w-4" />
              Add Rider
            </Button>
          </span>
        }
      />
      <Section aria-label="Rider list">
        <TableBoundary
          loading={loading}
          error={error}
          onRetry={refetch}
          errorTitle="Could not load riders"
          skeletonRows={8}
          skeletonColumns={9}
        >
          <Card className="overflow-hidden">
            <PaginatedDataTable<Rider>
              columns={columns}
              rows={rows}
              searchFields={["name", "email", "phone", "city", "id"]}
              onRowClick={(row) => router.push(`/dashboard/riders/${row.id}`)}
              emptyTitle="No riders found"
              exportName="/dashboard/riders"
              exportColumns={[
                { key: "name", header: "Rider" },
                { key: "email", header: "Email" },
                { key: "city", header: "City" },
                { key: "vehicle", header: "Vehicle" },
                { key: "deliveries", header: "Deliveries" },
                { key: "rating", header: "Rating" },
                { key: "earnings", header: "Earnings" },
                { key: "status", header: "Status" },
              ]}
            />
          </Card>
        </TableBoundary>
      </Section>

      <EntityDialog
        key={editing?.id ?? "new"}
        open={open}
        title={editing ? `Edit ${editing.name}` : "Add Rider"}
        fields={FIELDS}
        initial={
          editing
            ? {
                name: editing.name,
                email: editing.email,
                phone: editing.phone,
                city: editing.city,
                vehicle: editing.vehicle,
                status: editing.status,
              }
            : { city: "", vehicle: "scooter", status: "offline" }
        }
        onClose={() => setOpen(false)}
        onSave={async (v) => {
          await upsertRider(
            {
              name: v.name,
              email: v.email,
              phone: v.phone,
              city: v.city,
              vehicle: v.vehicle as Rider["vehicle"],
              status: v.status as Rider["status"],
              deliveries: editing?.deliveries,
              rating: editing?.rating,
              earnings: editing?.earnings,
            },
            editing?.id,
          );
          refetch();
        }}
      />

      {accessNotice ? (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {accessNotice}
        </p>
      ) : null}
      {accessError && !mode ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {accessError}
        </p>
      ) : null}

      <Section aria-label="Rider access" className="mt-8">
        <h2 className="mb-1 text-lg font-semibold text-card-foreground">
          Rider access
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Attach an existing account to a rider so they can sign in to the
          rider app. Accounts are not created here — sign the rider up in Supabase
          Auth first, or they will sign in to nothing.
        </p>
        <TableBoundary
          loading={access.loading}
          error={access.error}
          onRetry={() => void access.refetch()}
          errorTitle="Could not load rider access"
          skeletonRows={4}
        >
          {accessRows.length === 0 ? (
            <EmptyState
              title="No riders"
              description="Add a rider above, then attach an account to it."
            />
          ) : (
            <Card className="overflow-hidden">
              <DataTable columns={accessColumns} rows={accessRows} />
            </Card>
          )}
        </TableBoundary>
      </Section>

      {mode?.kind === "reassign" && mode.row ? (
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
            runAccess(
              async () => {
                await setRiderAccess(values.email.trim(), mode.row.riderId);
              },
              `${values.email.trim()} is now linked to ${mode.row.riderName}.`,
            )
          }
        />
      ) : null}

      {mode?.kind === "revoke" && mode.row ? (
        <RevokeRiderDialog
          email={mode.row.email}
          riderName={mode.row.riderName}
          busy={busy}
          onClose={() => setMode(null)}
          onConfirm={() =>
            runAccess(
              async () => {
                await revokeRiderAccess(mode.row.email);
              },
              `${mode.row.email} can no longer sign in as a rider. The login itself still exists.`,
            )
          }
        />
      ) : null}
    </PageContainer>
  );
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
  onConfirm: () => void;
}) {
  return (
    <Dialog open onClose={busy ? () => {} : onClose} title="Revoke rider access?">
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