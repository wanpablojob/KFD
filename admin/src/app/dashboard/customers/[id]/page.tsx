"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  fetchCustomerById,
  fetchCustomerOrders,
  type CustomerDelivery,
  type CustomerOrderPage,
} from "@/lib/supabase/customer-queries";
import { formatCurrency } from "@/lib/format";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import type { Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { useAsyncData } from "@/lib/use-async-data";
import { TableBoundary } from "@/components/ui/table-boundary";
import { tierLabelFor } from "@/lib/customer-tier";
import { EmptyState } from "@/components/ui/status";

/** Server-side page size for the order history. The pager asks for more. */
const ORDER_PAGE_SIZE = 25;

/**
 * What the orders query returns before the customer has resolved.
 *
 * The fetcher closes over the customer's auth id, which does not exist on the
 * first render, so the query cannot simply refuse to run: it would show an error
 * for a frame and then recover. Returning an empty page instead, and re-running
 * on the id arriving, keeps "not known yet" distinct from "no orders" -- the
 * same distinction lib/delivery-sync.ts makes on the rider side.
 */
const NOT_YET_RESOLVED: CustomerOrderPage = {
  rows: [],
  page: 1,
  total: 0,
  hasMore: false,
};

const columns: Column<CustomerDelivery>[] = [
  {
    key: "reference",
    header: "Reference",
    cell: (row) => (
      <span className="font-medium text-card-foreground">{row.reference}</span>
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
    cell: (row) => (
      <span className="font-medium text-card-foreground">
        {formatCurrency(row.total)}
      </span>
    ),
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
      <Badge variant="secondary" size="sm">
        {row.payment.replace(/_/g, " ")}
      </Badge>
    ),
  },
  {
    key: "placedAt",
    header: "Placed",
    cell: (row) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {row.placedAt.slice(0, 10)}
      </span>
    ),
  },
];

export default function CustomerDetailPage() {
  const params = useParams();
  const customerId = params.id as string;

  // Every fetcher closes over the route id (or the auth id derived from it) and
  // each is keyed by it. This page previously loaded the whole customer list and
  // asked for orders by that customer's NAME -- and useAsyncData captures its
  // fetcher once on mount, so the orders query went out before the name existed
  // and ran with "". It could never be corrected, so the page showed no orders
  // for anyone. Orders are read by orders.customer_user_id now.
  const [orderPage, setOrderPage] = useState(1);

  const customerQuery = useAsyncData(() => fetchCustomerById(customerId), customerId);
  const customer = customerQuery.data;

  const ordersQuery = useAsyncData(
    async () => {
      const userId = customer?.userId;
      if (!userId) return NOT_YET_RESOLVED;
      return fetchCustomerOrders(userId, {
        page: orderPage,
        limit: ORDER_PAGE_SIZE,
      });
    },
    `${customerId}:${customer?.userId ?? ""}:${orderPage}`,
  );

  if (customerQuery.loading) {
    return (
      <PageContainer>
        <PageHeader title="Loading…" />
      </PageContainer>
    );
  }

  // A failed fetch would otherwise fall through to "Customer not found", which
  // reads as a deleted customer rather than a network or RLS problem.
  if (customerQuery.error) {
    return (
      <PageContainer>
        <PageHeader
          title="Could not load this customer"
          description={customerQuery.error}
        />
      </PageContainer>
    );
  }

  if (!customer) {
    return (
      <PageContainer>
        <PageHeader
          title="Customer not found"
          description="The requested customer does not exist."
        />
      </PageContainer>
    );
  }

  const linked = customer.linked;
  const tier = tierLabelFor(customer.totalSpend);

  return (
    <PageContainer>
      <PageHeader
        title={customer.name}
        description={customer.email}
        actions={
          <Link href="/dashboard/customers">
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
              <p className="text-lg font-semibold text-card-foreground">
                {customer.name}
              </p>
              <p className="text-muted-foreground">{customer.email}</p>
              <p className="text-sm text-muted-foreground">
                {customer.phone ? `${customer.phone} · ` : ""}
                {customer.city}
              </p>
              <p className="text-xs text-muted-foreground">
                Joined {customer.joinedAt}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 ml-auto">
              <Badge
                variant={tier === "Gold" ? "warning" : tier === "Silver" ? "secondary" : "outline"}
                size="sm"
              >
                {tier}
              </Badge>
              {linked ? (
                <>
                  <Badge variant="secondary" size="sm">
                    {customer.ordersCount} orders
                  </Badge>
                  <Badge variant="secondary" size="sm">
                    {formatCurrency(customer.totalSpend ?? 0)} spent
                  </Badge>
                </>
              ) : (
                <Badge variant="outline" size="sm">
                  No linked account
                </Badge>
              )}
            </div>
          </div>

          {linked ? (
            <dl className="grid grid-cols-2 gap-4 border-t border-border px-5 py-4 sm:grid-cols-4">
              <Stat label="Delivered" value={String(customer.deliveredCount)} />
              <Stat label="Cancelled" value={String(customer.cancelledCount)} />
              <Stat
                label="Avg order"
                value={
                  customer.avgOrderValue === null
                    ? "—"
                    : formatCurrency(customer.avgOrderValue)
                }
              />
              <Stat
                label="Last order"
                value={customer.lastOrderAt ? customer.lastOrderAt.slice(0, 10) : "—"}
              />
            </dl>
          ) : (
            <p className="border-t border-border px-5 py-4 text-xs text-muted-foreground">
              This row is not linked to a sign-in account, so it has no orders of
              its own. Link it by matching its email to a customer account
              (migration 0059) before treating any figure here as a person&apos;s.
            </p>
          )}
        </Card>
      </Section>

      <Section aria-label="Order history">
        <TableBoundary
          loading={ordersQuery.loading}
          error={ordersQuery.error}
          onRetry={ordersQuery.refetch}
          errorTitle="Could not load order history"
          skeletonRows={5}
          skeletonColumns={7}
        >
          <Card className="overflow-hidden">
            {!linked ? (
              <EmptyState
                title="No order history"
                description="This customer has no linked account, so no orders can be attributed to them."
              />
            ) : (ordersQuery.data?.rows.length ?? 0) === 0 ? (
              <EmptyState
                title="No orders found"
                description="This customer has not placed any orders yet."
              />
            ) : (
              <>
                <DataTable
                  columns={columns}
                  rows={ordersQuery.data?.rows ?? []}
                />
                {ordersQuery.data && ordersQuery.data.total !== null ? (
                  <Pagination
                    page={orderPage}
                    pageSize={ORDER_PAGE_SIZE}
                    total={ordersQuery.data.total}
                    onPageChange={setOrderPage}
                  />
                ) : null}
              </>
            )}
          </Card>
        </TableBoundary>
      </Section>
    </PageContainer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-card-foreground">{value}</dd>
    </div>
  );
}