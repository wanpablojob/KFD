"use client";

import { fetchMenuItems } from "@/lib/supabase/queries";
import { formatCurrency } from "@/lib/format";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { LoadingState, EmptyState } from "@/components/ui/status";
import { useAsyncData } from "@/lib/use-async-data";
import type { MenuItem } from "@/lib/types";

const columns: Column<MenuItem>[] = [
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

export default function MenuPage() {
  const { data, loading, error } = useAsyncData(() => fetchMenuItems());

  return (
    <PageContainer>
      <PageHeader
        title="Menu Items"
        description="Catalog of dishes available across partner restaurants."
        actions={
          <Button variant="outline" size="sm" disabled>
            Add menu item
          </Button>
        }
      />
      <Section aria-label="Menu list">
        {loading ? (
          <LoadingState label="Loading menu items…" />
        ) : error ? (
          <EmptyState title="Could not load menu items" description={error} />
        ) : (
          <Card className="overflow-hidden">
            <DataTable columns={columns} rows={data ?? []} />
          </Card>
        )}
      </Section>
    </PageContainer>
  );
}