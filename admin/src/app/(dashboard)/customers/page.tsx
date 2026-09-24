"use client";

import { fetchCustomers } from "@/lib/supabase/queries";
import { formatCurrency } from "@/lib/format";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { LoadingState, EmptyState } from "@/components/ui/status";
import { useAsyncData } from "@/lib/use-async-data";
import type { Customer } from "@/lib/types";

const gold = (row: Customer) => row.totalSpend >= 400;
const silver = (row: Customer) => row.totalSpend >= 200 && !gold(row);

const columns: Column<Customer>[] = [
  {
    key: "name",
    header: "Customer",
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
    key: "tier",
    header: "Tier",
    cell: (row) => (
      <Badge variant={gold(row) ? "warning" : silver(row) ? "secondary" : "outline"} size="sm">
        {gold(row) ? "Gold" : silver(row) ? "Silver" : "Standard"}
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
    key: "totalSpend",
    header: "Total spent",
    align: "right",
    cell: (row) => (
      <span className="font-medium text-card-foreground">
        {formatCurrency(row.totalSpend)}
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

export default function CustomersPage() {
  const { data, loading, error } = useAsyncData(() => fetchCustomers());

  return (
    <PageContainer>
      <PageHeader
        title="Customers"
        description="Registered customers and their order activity."
      />
      <Section aria-label="Customer list">
        {loading ? (
          <LoadingState label="Loading customers…" />
        ) : error ? (
          <EmptyState title="Could not load customers" description={error} />
        ) : (
          <Card className="overflow-hidden">
            <DataTable columns={columns} rows={data ?? []} />
          </Card>
        )}
      </Section>
    </PageContainer>
  );
}