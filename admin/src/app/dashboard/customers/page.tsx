"use client";

import { useRouter } from "next/navigation";

import { fetchCustomerStats } from "@/lib/supabase/customer-queries";
import { formatCurrency } from "@/lib/format";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { PaginatedDataTable } from "@/components/ui/paginated-data-table";
import type { Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { useAsyncData } from "@/lib/use-async-data";
import { TableBoundary } from "@/components/ui/table-boundary";
import type { CustomerStats } from "@/lib/customer-stats";
import { tierLabelFor } from "@/lib/customer-tier";


const columns: Column<CustomerStats>[] = [
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
    cell: (row) => {
      const tier = tierLabelFor(row.totalSpend);
      return (
        <Badge
          variant={
            tier === "Gold" ? "warning" : tier === "Silver" ? "secondary" : "outline"
          }
          size="sm"
        >
          {tier}
        </Badge>
      );
    },
  },
  {
    key: "ordersCount",
    header: "Orders",
    align: "right",
    cell: (row) => (
      <span className="text-card-foreground">
        {row.linked ? row.ordersCount : "—"}
      </span>
    ),
  },
  {
    key: "totalSpend",
    header: "Total spent",
    align: "right",
    cell: (row) => (
      <span className="font-medium text-card-foreground">
        {row.totalSpend === null ? "—" : formatCurrency(row.totalSpend)}
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
  const {
    data,
    loading,
    error,
    refetch,
  } = useAsyncData(() => fetchCustomerStats());

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
            <CustomerStatsNote />
            <PaginatedDataTable<CustomerStats>
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
                  header: "Tier",
                  format: (row) => tierLabelFor(row.totalSpend),
                },
                { key: "ordersCount", header: "Orders" },
                {
                  key: "totalSpend",
                  header: "Total spent",
                  format: (row) =>
                    row.totalSpend === null ? "—" : formatCurrency(row.totalSpend),
                },
                { key: "joinedAt", header: "Joined" },
              ]}
            />
          </Card>
        </TableBoundary>
      </Section>
    </PageContainer>
  );
}

/**
 * The note that used to sit here claimed Orders/Total spent/Tier were seed
 * constants and that a customer could not be linked to their orders by id. Both
 * stopped being true at 0012 and 0059, so it is gone rather than reworded.
 *
 * What replaces it is narrower and still true: a row with no auth account has no
 * orders of its own, and saying "—" is the honest cell. Migration 0061 excludes
 * walk-in orders (no customer_user_id) from every per-customer aggregate and
 * reports them as a platform total instead, so they cannot inflate a spend here.
 */
function CustomerStatsNote() {
  return (
    <p
      className="border-b border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground"
      role="note"
    >
      Orders, total spent and tier are computed from each customer&apos;s own
      delivered orders. Rows without a linked account (seed fixtures) show “—”,
      and orders placed without an account are counted separately as walk-ins.
    </p>
  );
}