"use client";

import Link from "next/link";
import {
  fetchMerchantMenu,
  fetchMerchantOrders,
} from "@/lib/supabase/merchant-queries";
import { useUserRole } from "@/lib/use-user-role";
import { useAsyncData } from "@/lib/use-async-data";
import { PageContainer, PageHeader, StatGrid } from "@/components/layout/page";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/status";
import { TableBoundary } from "@/components/ui/table-boundary";
import { Button } from "@/components/ui/button";
import { OrderActions } from "@/components/merchant/order-actions";
import { NewOrderBanner } from "@/components/merchant/new-order-banner";
import { useOrderRealtime } from "@/lib/use-order-realtime";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { Order, Kpi } from "@/lib/types";

/**
 * Builds a level metric for <StatCard>.
 *
 * There is deliberately no `delta` argument. Every card on this screen is a
 * level (orders today, revenue today, needs action, menu live) and none has a
 * previous period to compare against, so the old default of `delta = 0` made
 * every card render a green "↑0%" trend arrow -- asserting "unchanged" about
 * something that was never measured. Omitting `delta` renders the hint alone
 * (Prompt 2.3).
 */
function stat(label: string, value: string, hint: string): Kpi {
  return { label, value, hint };
}

function orderLineTotal(order: Order): string {
  return formatCurrency(order.subtotal);
}

export default function MerchantTodayPage() {
  const { restaurantName, isMerchant } = useUserRole();
  const orders = useAsyncData(() => fetchMerchantOrders());
  const menu = useAsyncData(() => fetchMerchantMenu());

  // isMerchant is false until the role resolves, which keeps the subscription
  // from opening early. orders.refetch is a stable useCallback, so passing it
  // directly does not re-subscribe on every render.
  const { newOrder, dismissNewOrder } = useOrderRealtime(
    isMerchant,
    orders.refetch
  );

  // Both fetches feed this page, so both must be covered. Previously an
  // `if (loading)` early return meant a failure fell through to the empty
  // states below, which during an outage look exactly like a quiet day.
  const loadError = orders.error ?? menu.error;

  const rows = orders.data ?? [];
  const stats = deriveStats(rows, menu.data ?? []);

  const needsAction = rows.filter((o) => o.status === "pending");
  const inFlight = rows.filter(
    (o) => o.status === "confirmed" || o.status === "preparing"
  );
  const recent = rows.slice(0, 5);

  return (
    <PageContainer>
      <PageHeader
        title={restaurantName ? `${restaurantName} today` : "Today"}
        description="Orders that need you, and what is in the kitchen."
      />

      <TableBoundary
        loading={orders.loading || menu.loading}
        error={loadError}
        onRetry={() => {
          orders.refetch();
          menu.refetch();
        }}
        errorTitle="Could not load your dashboard"
        skeletonRows={4}
        skeletonColumns={3}
      >
        <StatGrid className="mb-6">
          <StatCard kpi={stat("Orders today", String(stats.today), "Excludes rejected")} />
          <StatCard
            kpi={stat("Revenue today", formatCurrency(stats.todayRevenue), "Order totals")}
          />
          <StatCard
            kpi={stat("Needs action", String(stats.pending), "Waiting on you")}
          />
          <StatCard
            kpi={stat(
              "Menu live",
              `${stats.menuLive}/${stats.menuTotal}`,
              "Available items"
            )}
          />
        </StatGrid>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Needs your decision" />
            <div className="px-5 pb-5">
              {needsAction.length === 0 ? (
                <EmptyState
                  title="Nothing waiting"
                  description="New orders appear here the moment they are placed."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {needsAction.map((order) => (
                    <li key={order.id} className="py-3 first:pt-0 last:pb-0">
                      <OrderRow order={order} onChanged={orders.refetch} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="In the kitchen" />
            <div className="px-5 pb-5">
              {inFlight.length === 0 ? (
                <EmptyState title="Nothing cooking" />
              ) : (
                <ul className="divide-y divide-border">
                  {inFlight.map((order) => (
                    <li key={order.id} className="py-3 first:pt-0 last:pb-0">
                      <OrderRow order={order} onChanged={orders.refetch} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Recent orders" />
            <div className="px-5 pb-5">
              {recent.length === 0 ? (
                <EmptyState title="No orders yet" />
              ) : (
                <ul className="divide-y divide-border">
                  {recent.map((order) => (
                    <li
                      key={order.id}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {order.reference} · {order.customer}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(order.placedAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-sm font-medium">
                          {orderLineTotal(order)}
                        </span>
                        <StatusBadge status={order.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/merchant/orders">See all orders</Link>
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </TableBoundary>

      <NewOrderBanner alert={newOrder} onDismiss={dismissNewOrder} />
    </PageContainer>
  );
}

function OrderRow({
  order,
  onChanged,
}: {
  order: Order;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-card-foreground">
            {order.reference}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {order.customer} · {order.items.length} item
            {order.items.length === 1 ? "" : "s"} ·{" "}
            {formatDateTime(order.placedAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-semibold">
            {formatCurrency(order.total)}
          </span>
          <StatusBadge status={order.status} />
        </div>
      </div>
      <OrderActions orderId={order.id} status={order.status} onChanged={onChanged} />
    </div>
  );
}

/**
 * Stats are derived from already-fetched rows rather than a second round trip.
 */
function deriveStats(orders: Order[], menu: { available: boolean }[]) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const todays = orders.filter(
    (o) => new Date(o.placedAt) >= startOfToday && o.status !== "cancelled"
  );

  return {
    today: todays.length,
    todayRevenue: todays.reduce((sum, o) => sum + o.total, 0),
    pending: orders.filter((o) => o.status === "pending").length,
    menuLive: menu.filter((m) => m.available).length,
    menuTotal: menu.length,
  };
}
