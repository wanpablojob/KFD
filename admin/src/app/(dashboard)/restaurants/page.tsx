"use client";

import { fetchRestaurants } from "@/lib/supabase/queries";
import { formatCurrency } from "@/lib/format";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { LoadingState, EmptyState } from "@/components/ui/status";
import { useAsyncData } from "@/lib/use-async-data";
import type { Restaurant } from "@/lib/types";

const columns: Column<Restaurant>[] = [
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
    cell: (row) => <StatusBadge status={row.status} />,
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

export default function RestaurantsPage() {
  const { data, loading, error } = useAsyncData(() => fetchRestaurants());

  return (
    <PageContainer>
      <PageHeader
        title="Restaurants"
        description="Partner restaurants on the KFD network."
        actions={
          <Button variant="outline" size="sm" disabled>
            Add restaurant
          </Button>
        }
      />
      <Section aria-label="Restaurant list">
        {loading ? (
          <LoadingState label="Loading restaurants…" />
        ) : error ? (
          <EmptyState title="Could not load restaurants" description={error} />
        ) : (
          <Card className="overflow-hidden">
            <DataTable columns={columns} rows={data ?? []} />
          </Card>
        )}
      </Section>
    </PageContainer>
  );
}