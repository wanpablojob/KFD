"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/status";
import { TableBoundary } from "@/components/ui/table-boundary";
import { Button } from "@/components/ui/button";
import { OrderActions } from "@/components/merchant/order-actions";
import { NewOrderBanner } from "@/components/merchant/new-order-banner";
import { StoreStatusCard } from "@/components/merchant/store-status-card";
import { RecentRatings } from "@/components/recent-ratings";
import { useOrderNotifications } from "@/lib/use-order-notifications";
import { formatCurrency } from "@/lib/format";
import {
  itemSummary,
  minutesWaiting,
  OVERDUE_MINUTES,
  todayStats,
} from "@/lib/merchant-today";
import type { Order } from "@/lib/types";

/**
 * The merchant's live screen: what needs a decision, what is cooking, and how
 * the day is going. Every card shows a level with no trend arrow -- there is no
 * previous period on this screen to compare against (Prompt 2.3).
 */
export default function MerchantTodayPage() {
  const { restaurantName, isMerchant } = useUserRole();
  const orders = useAsyncData(() => fetchMerchantOrders());
  const menu = useAsyncData(() => fetchMerchantMenu());

  // isMerchant is false until the role resolves, which keeps the subscription
  // from opening early. orders.refetch is a stable useCallback, so passing it
  // directly does not re-subscribe on every render.
  const { newOrder, dismissNewOrder } = useOrderNotifications(
    isMerchant,
    orders.refetch
  );

  // Re-render every 30s so "waiting N min" keeps counting without a refetch.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Both fetches feed this page, so both must be covered: a failure must not
  // fall through to empty states, which during an outage look like a quiet day.
  const loadError = orders.error ?? menu.error;

  const rows = orders.data ?? [];
  const menuRows = menu.data ?? [];
  const stats = todayStats(rows, now);
  const menuLive = menuRows.filter((m) => m.available).length;

  // Oldest first: the order that has waited longest is the one to answer next.
  const needsAction = rows
    .filter((o) => o.status === "pending")
    .sort((a, b) => a.placedAt.localeCompare(b.placedAt));
  const inFlight = rows.filter(
    (o) => o.status === "confirmed" || o.status === "preparing"
  );

  return (
    <PageContainer>
      <PageHeader
        title={restaurantName ? `${restaurantName} today` : "Today"}
        description="Orders that need you, and what is in the kitchen."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/merchant/orders">All orders</Link>
          </Button>
        }
      />

      <StoreStatusCard />

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
          <StatCard
            kpi={{ label: "Needs your decision", value: String(stats.pending), hint: "Waiting for you to accept" }}
          />
          <StatCard
            kpi={{ label: "Orders today", value: String(stats.orders), hint: "Excludes cancelled" }}
          />
          <StatCard
            kpi={{ label: "Sales today", value: formatCurrency(stats.sales), hint: "Food only, before delivery fees" }}
          />
          <StatCard
            kpi={{ label: "Menu live", value: `${menuLive}/${menuRows.length}`, hint: "Items customers can order" }}
          />
        </StatGrid>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Needs your decision"
              subtitle={needsAction.length > 0 ? "Oldest first" : undefined}
            />
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
                      <OrderRow order={order} now={now} onChanged={orders.refetch} />
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
                      <OrderRow order={order} now={now} onChanged={orders.refetch} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </TableBoundary>

      <div className="mt-6">
        <RecentRatings />
      </div>

      <NewOrderBanner alert={newOrder} onDismiss={dismissNewOrder} />
    </PageContainer>
  );
}

function OrderRow({
  order,
  now,
  onChanged,
}: {
  order: Order;
  now: Date;
  onChanged: () => void;
}) {
  const waited = minutesWaiting(order.placedAt, now);
  const overdue = order.status === "pending" && waited >= OVERDUE_MINUTES;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
            {order.reference}
            <Badge variant={overdue ? "destructive" : "secondary"} size="sm">
              {waited === 0 ? "just now" : `${waited} min ago`}
            </Badge>
          </p>
          {/* What to cook, not just how many lines: the kitchen acts on this. */}
          <p className="mt-1 text-sm text-card-foreground">{itemSummary(order.items)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {order.customer}
            {/* Riders are offered the order when it is accepted (0085), so the
                kitchen can see whether someone is coming for it. */}
            {order.status === "pending"
              ? null
              : order.rider
                ? ` · Rider: ${order.rider}`
                : " · Finding a rider…"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Food subtotal: the delivery and service fees are not the kitchen's. */}
          <span className="text-sm font-semibold">{formatCurrency(order.subtotal)}</span>
          <StatusBadge status={order.status} />
        </div>
      </div>
      <OrderActions orderId={order.id} status={order.status} onChanged={onChanged} />
    </div>
  );
}
