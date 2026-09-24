"use client";

import { fetchRiders } from "@/lib/supabase/queries";
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
import type { Rider } from "@/lib/types";

const columns: Column<Rider>[] = [
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
    cell: (row) => <StatusBadge status={row.status} />,
  },
];

export default function RidersPage() {
  const { data, loading, error } = useAsyncData(() => fetchRiders());

  return (
    <PageContainer>
      <PageHeader
        title="Riders"
        description="Fleet of active delivery partners."
        actions={
          <Button variant="outline" size="sm" disabled>
            Invite rider
          </Button>
        }
      />
      <Section aria-label="Rider list">
        {loading ? (
          <LoadingState label="Loading riders…" />
        ) : error ? (
          <EmptyState title="Could not load riders" description={error} />
        ) : (
          <Card className="overflow-hidden">
            <DataTable columns={columns} rows={data ?? []} />
          </Card>
        )}
      </Section>
    </PageContainer>
  );
}