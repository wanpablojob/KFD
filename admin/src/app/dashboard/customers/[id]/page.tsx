"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  fetchCustomerById,
  fetchCustomerOrders,
  fetchCustomerSummary,
  setCustomerArchived,
  setCustomerBlocked,
  updateCustomerContact,
  type CustomerDelivery,
  type CustomerOrderPage,
} from "@/lib/supabase/customer-queries";
import { formatCurrency } from "@/lib/format";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import type { Column } from "@/components/ui/data-table";
import type { CustomerStats } from "@/lib/customer-stats";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { ArchiveButton } from "@/components/ui/archive-button";
import { EntityDialog } from "@/components/ui/entity-dialog";
import { useAsyncData } from "@/lib/use-async-data";
import { TableBoundary } from "@/components/ui/table-boundary";
import { tierLabelFor } from "@/lib/customer-tier";
import { paymentMixShares } from "@/lib/customer-summary";
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

  // Aggregated server-side over ALL orders: the history above is one page, so a
  // mix computed from it would be wrong for exactly the busiest customers.
  const summaryQuery = useAsyncData(
    () => fetchCustomerSummary(customer?.userId ?? null),
    `${customerId}:${customer?.userId ?? ""}:summary`,
  );

  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function toggleBlocked(id: string, blocked: boolean) {
    setActionError(null);
    try {
      await setCustomerBlocked(id, blocked);
      customerQuery.refetch();
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Could not update. Try again.",
      );
    }
  }

  async function toggleArchived(id: string, archived: boolean) {
    setActionError(null);
    try {
      await setCustomerArchived(id, archived);
      customerQuery.refetch();
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Could not update. Try again.",
      );
    }
  }

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

      <Section aria-label="Order profile">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-card-foreground">
              Order status mix
            </h2>
            {!linked ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No linked account, so no orders to break down.
              </p>
            ) : Object.keys(summaryQuery.data?.statusCounts ?? {}).length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                This customer has not ordered yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {Object.entries(summaryQuery.data?.statusCounts ?? {}).map(
                  ([status, count]) => (
                    <li
                      key={status}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <StatusBadge status={status as CustomerDelivery["status"]} />
                      <span className="text-card-foreground">{count}</span>
                    </li>
                  ),
                )}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-card-foreground">
              Payment methods
            </h2>
            {paymentMixShares(summaryQuery.data?.paymentCounts ?? {}).length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No payment history yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {paymentMixShares(summaryQuery.data?.paymentCounts ?? {}).map(
                  (row) => (
                    <li
                      key={row.key}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="text-card-foreground">
                        {row.count} · {Math.round(row.share * 100)}%
                      </span>
                    </li>
                  ),
                )}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-card-foreground">
              Delivery addresses
            </h2>
            {summaryQuery.data?.recentAddresses.length ? (
              <ul className="mt-3 space-y-3">
                {summaryQuery.data.recentAddresses.slice(0, 5).map((entry) => (
                  <li key={entry.address} className="text-sm">
                    <p className="text-card-foreground">{entry.address}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.times} order{entry.times === 1 ? "" : "s"} · last used{" "}
                      {entry.lastUsed ? entry.lastUsed.slice(0, 10) : "unknown"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                No addresses recorded yet. Customers type one at checkout.
              </p>
            )}
          </Card>
        </div>
      </Section>

      <Section aria-label="Operator notes">
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-card-foreground">
                Operator notes
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Internal only. Riders and customers never see this.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit contact &amp; notes
            </Button>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm text-card-foreground">
            {customer.notes ?? "No notes yet."}
          </p>
          {actionError ? (
            <p className="mt-3 text-xs text-destructive">{actionError}</p>
          ) : null}
        </Card>
      </Section>

      <Section aria-label="Customer actions">
        <Card className="flex flex-wrap items-center gap-3 p-5">
          <Button
            variant={customer.blockedAt ? "outline" : "destructive"}
            size="sm"
            onClick={() =>
              void toggleBlocked(
                customer.id,
                customer.blockedAt === null,
              )
            }
          >
            {customer.blockedAt ? "Unblock customer" : "Block customer"}
          </Button>
          <ArchiveButton
            name={customer.name}
            archived={customer.archivedAt !== null}
            onChange={(next) => toggleArchived(customer.id, next)}
          />
          <p className="text-xs text-muted-foreground">
            Blocking stops new orders immediately (customer_place_order refuses
            them). Archiving only hides the record; both are reversible.
          </p>
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
      {editing && customer ? (
        <EditCustomerDialog
          key={customer.id}
          customer={customer}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            customerQuery.refetch();
          }}
        />
      ) : null}
    </PageContainer>
  );
}

/**
 * Contact + note editor.
 *
 * email is deliberately absent. customers.email is the identity
 * /api/orders/notify resolves to find this customer's address, and auth.users
 * holds a second copy that this RPC cannot reach; editing one without the other
 * would silently stop order emails reaching them. It is shown read-only instead.
 *
 * The two phone numbers are labelled by source because they are genuinely
 * different things: customers.phone is what the operator records, while the
 * number the rider dials is auth metadata snapshotted onto each order at
 * checkout. Showing one number without saying which it is would let an operator
 * correct the wrong one.
 */
function EditCustomerDialog({
  customer,
  onClose,
  onSaved,
}: {
  customer: CustomerStats;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <EntityDialog
      open
      title={`Edit ${customer.name}`}
      description="Changes apply to the customer record only. The contact number a rider dials comes from the customer's own profile."
      fields={[
        { key: "name", label: "Name", required: true },
        { key: "phone", label: "Phone (customer record)" },
        { key: "city", label: "City", required: true },
        { key: "notes", label: "Internal notes" },
      ]}
      initial={{
        name: customer.name,
        phone: customer.phone,
        city: customer.city,
        notes: customer.notes ?? "",
      }}
      onClose={onClose}
      onSave={async (values) => {
        await updateCustomerContact({
          customerId: customer.id,
          name: values.name ?? "",
          phone: values.phone ?? "",
          city: values.city ?? "",
          notes: values.notes ?? "",
        });
        onSaved();
      }}
    />
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