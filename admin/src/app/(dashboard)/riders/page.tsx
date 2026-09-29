"use client";

import { useState } from "react";
import { fetchRiders, setRiderArchived, setRiderStatus, upsertRider } from "@/lib/supabase/queries";
import { formatCurrency } from "@/lib/format";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
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
  const { data, loading, error, refetch } = useAsyncData(() => fetchRiders());
  const [editing, setEditing] = useState<Rider | null>(null);
  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const rows = (data ?? []).filter((r) => showArchived || !r.archivedAt);
  const archivedCount = (data ?? []).length - rows.length;

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
              onRowClick={(row) => window.location.href = `/riders/${row.id}`}
              emptyTitle="No riders found"
              exportName="riders"
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
    </PageContainer>
  );
}