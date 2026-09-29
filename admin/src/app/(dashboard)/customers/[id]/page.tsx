"use client";

import { useParams } from "next/navigation";
import { fetchCustomers, fetchOrdersByCustomer } from "@/lib/supabase/queries";
import { formatCurrency } from "@/lib/format";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { PaginatedDataTable } from "@/components/ui/paginated-data-table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "@/components/ui/icons";
import Link from "next/link";
import { useAsyncData } from "@/lib/use-async-data";
import { TableBoundary } from "@/components/ui/table-boundary";
import type { Column } from "@/components/ui/data-table";
import type { Customer, Order } from "@/lib/types";

const columns: Column<Order>[] = [
  {
    key: "reference",
    header: "Reference",
    cell: (row) => <span className="font-medium text-card-foreground">{row.reference}</span>,
  },
  {
    key: "restaurant",
    header: "Restaurant",
    cell: (row) => row.restaurant,
  },
  {
    key: "total",
    header: "Total",
    align: "right",
    cell: (row) => <span className="font-medium text-card-foreground">{formatCurrency(row.total)}</span>,
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: "payment",
    header: "Payment",
    cell: (row) => (
      <Badge variant="secondary" size="sm">{row.payment.replace(/_/g, " ")}</Badge>
    ),
  },
  {
    key: "placedAt",
    header: "Placed",
    cell: (row) => <span className="whitespace-nowrap text-muted-foreground">{row.placedAt}</span>,
  },
];

export default function CustomerDetailPage() {
  const params = useParams();
  const customerId = params.id as string;

  const { data: customers, loading: customersLoading, error: customersError } = useAsyncData(() =>
    fetchCustomers(),
  );
  const { data: orders, loading: ordersLoading, error: ordersError } = useAsyncData(() =>
    fetchOrdersByCustomer(
      customers?.find((c) => c.id === customerId)?.name ?? "",
    ),
  );

  const customer = customers?.find((c) => c.id === customerId);
  const loading = customersLoading || ordersLoading;
  const error = customersError || ordersError;

  if (loading) {
    return (
      <PageContainer>
        <PageHeader title="Loading…" />
      </PageContainer>
    );
  }

  if (!customer) {
    return (
      <PageContainer>
        <PageHeader title="Customer not found" description="The requested customer does not exist." />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={customer.name}
        description={customer.email}
        actions={
          <Link href="/customers">
            <Button variant="outline" size="sm">
              <ArrowLeftIcon className="h-4 w-4" />
              Back to Customers
            </Button>
          </Link>
        }
      />

      <Section aria-label="Customer details">
        <Card className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-5">
            <Avatar name={customer.name} size="lg" />
            <div className="space-y-1">
              <p className="text-lg font-semibold text-card-foreground">{customer.name}</p>
              <p className="text-muted-foreground">{customer.email}</p>
              <p className="text-sm text-muted-foreground">
                {customer.phone} · {customer.city}
              </p>
              <p className="text-xs text-muted-foreground">Joined {customer.joinedAt}</p>
            </div>
            <div className="flex flex-wrap gap-2 ml-auto">
              <Badge variant="secondary" size="sm">
                {customer.ordersCount} orders (sample)
              </Badge>
              <Badge variant="secondary" size="sm">
                {formatCurrency(customer.totalSpend)} total (sample)
              </Badge>
            </div>
          </div>
        </Card>
      </Section>

      <Section aria-label="Order history">
        <TableBoundary
          loading={ordersLoading}
          error={ordersError}
          onRetry={() => {}}
          errorTitle="Could not load order history"
          skeletonRows={5}
          skeletonColumns={6}
        >
          <Card className="overflow-hidden">
            <PaginatedDataTable<Order>
              columns={columns}
              rows={orders ?? []}
              searchFields={["reference", "restaurant", "status", "payment"]}
              emptyTitle="No orders found"
              emptyDescription="This customer has not placed any orders yet."
              exportName={`customer-${customer.name}-orders`}
              exportColumns={[
                { key: "reference", header: "Reference" },
                { key: "restaurant", header: "Restaurant" },
                { key: "total", header: "Total", format: (row) => formatCurrency(row.total) },
                { key: "status", header: "Status" },
                { key: "payment", header: "Payment" },
                { key: "placedAt", header: "Placed" },
              ]}
            />
          </Card>
        </TableBoundary>
      </Section>
    </PageContainer>
  );
}