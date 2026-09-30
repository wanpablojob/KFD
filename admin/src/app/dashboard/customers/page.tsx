"use client";

import { useRouter } from "next/navigation";

import { fetchCustomers } from "@/lib/supabase/queries";
import { formatCurrency } from "@/lib/format";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { PaginatedDataTable } from "@/components/ui/paginated-data-table";
import type { Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { useAsyncData } from "@/lib/use-async-data";
import { TableBoundary } from "@/components/ui/table-boundary";
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
    header: "Tier (sample)",
    cell: (row) => (
      <Badge variant={gold(row) ? "warning" : silver(row) ? "secondary" : "outline"} size="sm">
        {gold(row) ? "Gold" : silver(row) ? "Silver" : "Standard"}
      </Badge>
    ),
  },
  {
    key: "ordersCount",
    header: "Orders (sample)",
    align: "right",
    cell: (row) => (
      <span className="text-card-foreground">{row.ordersCount}</span>
    ),
  },
  {
    key: "totalSpend",
    header: "Total spent (sample)",
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
  const router = useRouter();
  const { data, loading, error, refetch } = useAsyncData(() =>
    fetchCustomers(),
  );

  return (
    <PageContainer>
      <PageHeader
        title="Customers"
        description="Registered customers and their order activity."
      />
      <Section aria-label="Customer list">
        <TableBoundary
          loading={loading}
          error={error}
          onRetry={refetch}
          errorTitle="Could not load customers"
          skeletonRows={8}
          skeletonColumns={6}
        >
          <Card className="overflow-hidden">
            {/* Prompt 2.4, customer half. `orders.customer` is free text with
                no foreign key to `/dashboard/customers`, so a correct per-customer
                aggregate cannot be maintained -- the only available join is on
                a name string, which silently misattributes orders between
                same-named customers. The restaurant aggregates WERE made real
                (0008_aggregate_refresh.sql); these were not.

                So the Orders, Total spent and Tier columns below are seed-time
                constants, not live figures. They are labelled as sample data
                rather than quietly presented as a leaderboard. */}
            <p
              className="border-b border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground"
              role="note"
            >
              Orders, Total spent and Tier are sample values from the seed data,
              not live aggregates. A customer cannot yet be linked to their
              orders by id, so these figures do not update.
            </p>
            <PaginatedDataTable<Customer>
              columns={columns}
              rows={data ?? []}
              searchFields={["name", "email", "phone", "city", "id"]}
              onRowClick={(row) => router.push(`/dashboard/customers/${row.id}`)}
              emptyTitle="No customers found"
              exportName="/dashboard/customers"
              exportColumns={[
                { key: "name", header: "Customer" },
                { key: "email", header: "Email" },
                { key: "city", header: "City" },
                {
                  key: "totalSpend",
                  header: "Tier (sample)",
                  format: (row) =>
                    gold(row) ? "Gold" : silver(row) ? "Silver" : "Standard",
                },
                { key: "ordersCount", header: "Orders (sample)" },
                { key: "totalSpend", header: "Total spent (sample)" },
                { key: "joinedAt", header: "Joined" },
              ]}
            />
          </Card>
        </TableBoundary>
      </Section>
    </PageContainer>
  );
}