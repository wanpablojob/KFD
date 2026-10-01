"use client";

import { useState } from "react";
import {
  fetchMenuItems,
  fetchRestaurants,
  setMenuItemAvailable,
  upsertMenuItem,
} from "@/lib/supabase/queries";
import { formatCurrency } from "@/lib/format";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PaginatedDataTable } from "@/components/ui/paginated-data-table";
import { EntityDialog, type DialogField } from "@/components/ui/entity-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PlusIcon } from "@/components/ui/icons";
import type { Column } from "@/components/ui/data-table";
import { useAsyncData } from "@/lib/use-async-data";
import { TableBoundary } from "@/components/ui/table-boundary";
import type { MenuItem, Restaurant } from "@/lib/types";

const baseColumns: Column<MenuItem>[] = [
  {
    key: "name",
    header: "Item",
    cell: (row) => (
      <span className="font-medium text-card-foreground">{row.name}</span>
    ),
  },
  { key: "restaurant", header: "Restaurant", cell: (row) => row.restaurant },
  {
    key: "category",
    header: "Category",
    cell: (row) => (
      <Badge variant="secondary" size="sm">
        {row.category}
      </Badge>
    ),
  },
  {
    key: "price",
    header: "Price",
    align: "right",
    cell: (row) => (
      <span className="font-medium text-card-foreground">
        {formatCurrency(row.price)}
      </span>
    ),
  },
  {
    key: "available",
    header: "Availability",
    cell: (row) =>
      row.available ? (
        <Badge variant="success" size="sm">
          Available
        </Badge>
      ) : (
        <Badge variant="destructive" size="sm">
          Sold out
        </Badge>
      ),
  },
];

function menuFields(restaurants: Restaurant[]): DialogField[] {
  return [
    {
      key: "restaurant_id",
      label: "Restaurant",
      required: true,
      // A select of real restaurants rather than a free-text name: 0027 makes
      // menu_items.restaurant_id NOT NULL, and an id that does not exist is
      // rejected by the FK. The denormalised `restaurant` name is still written
      // for the storefront and receipts, taken from this same choice.
      options: restaurants.map((r) => ({ value: r.id, label: r.name })),
    },
    { key: "name", label: "Item name", required: true },
    { key: "category", label: "Category", required: true },
    { key: "price", label: "Price", type: "number", required: true },
  ];
}

export default function MenuPage() {
  const { data, loading, error, refetch } = useAsyncData(() =>
    fetchMenuItems(),
  );
  const { data: restaurants } = useAsyncData(() => fetchRestaurants());
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [open, setOpen] = useState(false);

  const columns: Column<MenuItem>[] = [
    ...baseColumns,
    {
      key: "availableToggle",
      header: "Listed",
      cell: (row) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={row.available}
            label={`List ${row.name}`}
            onCheckedChange={async (checked) => {
              await setMenuItemAvailable(row.id, checked);
              refetch();
            }}
          />
        </span>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Menu Items"
        description="Catalog of dishes available across partner restaurants."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <PlusIcon className="h-4 w-4" />
            Add Item
          </Button>
        }
      />
      <Section aria-label="Menu list">
        <TableBoundary
          loading={loading}
          error={error}
          onRetry={refetch}
          errorTitle="Could not load menu items"
          skeletonRows={8}
          skeletonColumns={6}
        >
          <Card className="overflow-hidden">
            <PaginatedDataTable<MenuItem>
              columns={columns}
              rows={data ?? []}
              searchFields={["name", "restaurant", "category", "id"]}
              onRowClick={(row) => {
                setEditing(row);
                setOpen(true);
              }}
              emptyTitle="No menu items found"
              exportName="menu-items"
              exportColumns={[
                { key: "name", header: "Item" },
                { key: "restaurant", header: "Restaurant" },
                { key: "category", header: "Category" },
                { key: "price", header: "Price" },
                { key: "available", header: "Availability" },
              ]}
            />
          </Card>
        </TableBoundary>
      </Section>

      <EntityDialog
        key={editing?.id ?? "new"}
        open={open}
        title={editing ? `Edit ${editing.name}` : "Add Menu Item"}
        fields={menuFields(restaurants ?? [])}
        initial={
          editing
            ? {
                restaurant_id: editing.restaurant_id,
                name: editing.name,
                category: editing.category,
                price: String(editing.price),
              }
            : {}
        }
        onClose={() => setOpen(false)}
        onSave={async (v) => {
          // Name and id come from the same selection, so the denormalised
          // restaurant text can never disagree with the FK.
          const restaurant = restaurants?.find((r) => r.id === v.restaurant_id);
          if (!restaurant) {
            throw new Error("Pick a restaurant for this item.");
          }
          await upsertMenuItem(
            {
              restaurant: restaurant.name,
              restaurant_id: restaurant.id,
              name: v.name,
              category: v.category,
              price: Number(v.price),
              available: editing?.available,
            },
            editing?.id,
          );
          refetch();
        }}
      />
    </PageContainer>
  );
}