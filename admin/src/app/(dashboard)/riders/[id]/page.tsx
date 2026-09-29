"use client";

import { useParams } from "next/navigation";
import { fetchRiders, fetchOrdersByRider } from "@/lib/supabase/queries";
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
import type { Rider, Order } from "@/lib/types";

const columns: Column<Order>[] = [
  {
    key: "reference",
    header: "Reference",
    cell: (row) => <span className="font-medium text-card-foreground">{row.reference}</span>,
  },
  {
    key: "customer",
    header: "Customer",
    cell: (row) => (
      <span className="flex items-center gap-2.5">
        <Avatar name={row.customer} size="sm" />
        <span className="text-card-foreground">{row.customer}</span>
      </span>
    ),
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

export default function RiderDetailPage() {
  const params = useParams();
  const riderId = params.id as string;

  const { data: riders, loading: ridersLoading, error: ridersError } = useAsyncData(() =>
    fetchRiders(),
  );
  const { data: orders, loading: ordersLoading, error: ordersError } = useAsyncData(() =>
    fetchOrdersByRider(
      riders?.find((r) => r.id === riderId)?.name ?? "",
    ),
  );

  const rider = riders?.find((r) => r.id === riderId);
  const loading = ridersLoading || ordersLoading;
  const error = ridersError || ordersError;

  if (loading) {
    return (
      <PageContainer>
        <PageHeader title="Loading…" />
      </PageContainer>
    );
  }

  if (!rider) {
    return (
      <PageContainer>
        <PageHeader title="Rider not found" description="The requested rider does not exist." />
      </PageContainer>
    );
  }

  const deliveredOrders = orders?.filter((o) => o.status === "delivered") ?? [];
  const totalDeliveries = deliveredOrders.length;
  const totalEarnings = deliveredOrders.reduce((sum, o) => sum + o.total, 0);

  return (
    <PageContainer>
      <PageHeader
        title={rider.name}
        description={rider.email}
        actions={
          <Link href="/riders">
            <Button variant="outline" size="sm">
              <ArrowLeftIcon className="h-4 w-4" />
              Back to Riders
            </Button>
          </Link>
        }
      />

      <Section aria-label="Rider details">
        <Card className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-5">
            <Avatar name={rider.name} size="lg" />
            <div className="space-y-1">
              <p className="text-lg font-semibold text-card-foreground">{rider.name}</p>
              <p className="text-muted-foreground">{rider.email}</p>
              <p className="text-sm text-muted-foreground">
                {rider.phone} · {rider.city} · {rider.vehicle}
              </p>
              <p className="text-xs text-muted-foreground">
                Status: {rider.status} · Rating: {rider.rating} ★
              </p>
            </div>
            <div className="flex flex-wrap gap-2 ml-auto">
              <Badge variant="secondary" size="sm">{totalDeliveries} deliveries</Badge>
              <Badge variant="secondary" size="sm">{formatCurrency(totalEarnings)} earnings</Badge>
            </div>
          </div>
        </Card>
      </Section>

      <Section aria-label="Delivery history">
        <TableBoundary
          loading={ordersLoading}
          error={ordersError}
          onRetry={() => {}}
          errorTitle="Could not load delivery history"
          skeletonRows={5}
          skeletonColumns={7}
        >
          <Card className="overflow-hidden">
            <PaginatedDataTable<Order>
              columns={columns}
              rows={orders ?? []}
              searchFields={["reference", "customer", "restaurant", "status", "payment"]}
              emptyTitle="No deliveries found"
              emptyDescription="This rider has not completed any deliveries yet."
              exportName={`rider-${rider.name}-deliveries`}
              exportColumns={[
                { key: "reference", header: "Reference" },
                { key: "customer", header: "Customer" },
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