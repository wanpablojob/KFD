"use client";

import { useState } from "react";
import {
  fetchRestaurants,
  setRestaurantArchived,
  upsertRestaurant,
} from "@/lib/supabase/queries";
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
import { PlusIcon } from "@/components/ui/icons";
import type { Column } from "@/components/ui/data-table";
import { useAsyncData } from "@/lib/use-async-data";
import { TableBoundary } from "@/components/ui/table-boundary";
import type { Restaurant } from "@/lib/types";

const baseColumns: Column<Restaurant>[] = [
  {
    key: "name",
    header: "Restaurant",
    cell: (row) => (
      <span className="flex items-center gap-2.5">
        <Avatar name={row.name} size="sm" />
        <span className="min-w-0">
          <span className="block font-medium text-card-foreground">
            {row.name}
          </span>
          <span className="block text-xs text-muted-foreground">
            {row.cuisine}
          </span>
        </span>
      </span>
    ),
  },
  { key: "city", header: "City", cell: (row) => row.city },
  {
    key: "rating",
    header: "Rating",
    cell: (row) => (
      <Badge variant="secondary" size="sm">
        {row.rating} ★
      </Badge>
    ),
  },
  {
    key: "ordersCount",
    header: "Orders",
    align: "right",
    cell: (row) => (
      <span className="text-card-foreground">{row.ordersCount}</span>
    ),
  },
  {
    key: "revenue",
    header: "Revenue",
    align: "right",
    cell: (row) => (
      <span className="font-medium text-card-foreground">
        {formatCurrency(row.revenue)}
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
  {
    key: "joinedAt",
    header: "Joined",
    cell: (row) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {row.joinedAt}
      </span>
    ),
  },
];

const FIELDS: DialogField[] = [
  { key: "name", label: "Name", required: true },
  { key: "cuisine", label: "Cuisine", required: true },
  { key: "city", label: "City", required: true },
  { key: "status", label: "Status", options: ["active", "approval", "suspended"] },
];

export default function RestaurantsPage() {
  const { data, loading, error, refetch } = useAsyncData(() =>
    fetchRestaurants(),
  );
  const [editing, setEditing] = useState<Restaurant | null>(null);
  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const rows = (data ?? []).filter((r) => showArchived || !r.archivedAt);
  const archivedCount = (data ?? []).length - rows.length;

  const columns: Column<Restaurant>[] = [
    ...baseColumns,
    {
      key: "archive",
      header: "",
      align: "right",
      cell: (row) => (
        <ArchiveButton
          name={row.name}
          archived={Boolean(row.archivedAt)}
          onChange={async (archived) => {
            await setRestaurantArchived(row.id, archived);
            refetch();
          }}
        />
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Restaurants"
        description="Partner restaurants on the KFD network."
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
              Add Restaurant
            </Button>
          </span>
        }
      />
      <Section aria-label="Restaurant list">
        <TableBoundary
          loading={loading}
          error={error}
          onRetry={refetch}
          errorTitle="Could not load restaurants"
          skeletonRows={8}
          skeletonColumns={8}
        >
          <Card className="overflow-hidden">
            <PaginatedDataTable<Restaurant>
              columns={columns}
              rows={rows}
              searchFields={["name", "cuisine", "city", "id"]}
              onRowClick={(row) => {
                setEditing(row);
                setOpen(true);
              }}
              emptyTitle="No restaurants found"
              exportName="restaurants"
              exportColumns={[
                { key: "name", header: "Restaurant" },
                { key: "cuisine", header: "Cuisine" },
                { key: "city", header: "City" },
                { key: "rating", header: "Rating" },
                { key: "ordersCount", header: "Orders" },
                { key: "revenue", header: "Revenue" },
                { key: "status", header: "Status" },
                { key: "joinedAt", header: "Joined" },
              ]}
            />
          </Card>
        </TableBoundary>
      </Section>

      <EntityDialog
        key={editing?.id ?? "new"}
        open={open}
        title={editing ? `Edit ${editing.name}` : "Add Restaurant"}
        fields={FIELDS}
        initial={
          editing
            ? {
                name: editing.name,
                cuisine: editing.cuisine,
                city: editing.city,
                status: editing.status,
              }
            : { status: "active" }
        }
        onClose={() => setOpen(false)}
        onSave={async (v) => {
          await upsertRestaurant(
            {
              name: v.name,
              cuisine: v.cuisine,
              city: v.city,
              status: v.status as Restaurant["status"],
              rating: editing?.rating,
              ordersCount: editing?.ordersCount,
              revenue: editing?.revenue,
              joinedAt: editing?.joinedAt,
            },
            editing?.id,
          );
          refetch();
        }}
      />
    </PageContainer>
  );
}