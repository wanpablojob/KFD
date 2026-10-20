"use client";

import Link from "next/link";
import {
  fetchDisputedPayouts,
  fetchOrders,
  fetchRiderApplications,
  fetchRiderCashPositions,
  fetchRiderDeletionRequests,
  fetchRiders,
} from "@/lib/supabase/queries";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { PageContainer, PageHeader, Section, Stack, StatGrid } from "@/components/layout/page";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { RevenueChart } from "@/components/charts/revenue-chart";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { ArrowRightIcon } from "@/components/ui/icons";
import { LoadingState, EmptyState } from "@/components/ui/status";
import { useAsyncData } from "@/lib/use-async-data";
import {
  buildRevenueSeries,
  netRevenue,
  periodDelta,
  splitPeriods,
  PERIOD_DAYS,
} from "@/lib/dashboard-metrics";
import { attentionItems, liveCounts, topRestaurants } from "@/lib/dashboard-attention";
import { WaitingForRider } from "@/components/waiting-for-rider";
import { fetchPendingDeliveries } from "@/lib/supabase/dispatch-queries";
import type { Kpi } from "@/lib/types";

/**
 * The admin's first screen: what needs a person now, then how the week went.
 *
 * Orders and riders gate the page. The queue counts (cash, disputes,
 * applications, deletion requests) are best-effort: if one of those reads
 * fails -- typically a migration not applied yet -- its item is simply absent
 * rather than taking the whole overview down.
 */
export default function OverviewPage() {
  const orders = useAsyncData(() => fetchOrders());
  // Trips waiting for a rider (0093): a basket from several shops is one
  // job, and it is dispatched as one.
  const deliveries = useAsyncData(() => fetchPendingDeliveries());
  const riders = useAsyncData(() => fetchRiders());
  const cash = useAsyncData(() => fetchRiderCashPositions());
  const disputes = useAsyncData(() => fetchDisputedPayouts());
  const applications = useAsyncData(() => fetchRiderApplications("pending"));
  const deletions = useAsyncData(() => fetchRiderDeletionRequests());

  const loading = orders.loading || riders.loading;
  const error = orders.error ?? riders.error;

  if (loading) {
    return (
      <PageContainer>
        <PageHeader title="Overview" description="Loading live operations summary…" />
        <LoadingState label="Loading dashboard…" />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <PageHeader title="Overview" description="Live operations summary for KFD across Kabankalan City Proper." />
        <EmptyState title="Could not load dashboard data" description={error} />
      </PageContainer>
    );
  }

  const now = new Date();
  const orderRows = orders.data ?? [];
  const riderRows = riders.data ?? [];

  const onlineRiders = riderRows.filter((r) => r.status === "online").length;
  const cashWithRiders = (cash.data ?? []).reduce((sum, r) => sum + r.onHand, 0);
  const ridersHoldingCash = (cash.data ?? []).filter((r) => r.onHand > 0).length;

  const deltas = splitPeriods(orderRows, []);
  const live = liveCounts(orderRows);
  const attention = attentionItems(
    {
      orders: orderRows,
      disputedPayouts: disputes.data?.length ?? 0,
      pendingApplications: applications.data?.length ?? 0,
      deletionRequests: deletions.data?.size ?? 0,
    },
    now,
  );

  // Window policy (Prompt 2.1): a flow metric's value and its delta describe
  // the same 7 days; a level (riders online, cash held) has no delta, because
  // there is no recorded previous value to compare against.
  const WINDOW_LABEL = `(${PERIOD_DAYS}d)`;

  const kpis = [
    {
      label: `Net Revenue ${WINDOW_LABEL}`,
      value: formatCurrency(deltas.revenue.current),
      delta: periodDelta(deltas.revenue.current, deltas.revenue.previous),
      hint: "delivered orders, net of refunds · vs prev 7 days",
    },
    {
      label: `Orders ${WINDOW_LABEL}`,
      value: deltas.orders.current.toLocaleString(),
      delta: periodDelta(deltas.orders.current, deltas.orders.previous),
      hint: "vs prev 7 days",
    },
    {
      label: "Cash with riders",
      value: cash.data ? formatCurrency(cashWithRiders) : "—",
      hint: `${ridersHoldingCash} ${ridersHoldingCash === 1 ? "rider" : "riders"} to collect from`,
    },
    {
      label: "Riders Online",
      value: onlineRiders.toLocaleString(),
      hint: `of ${riderRows.filter((r) => !r.archivedAt).length} active riders`,
    },
  ] satisfies readonly Kpi[];

  const top = topRestaurants(orderRows, now, PERIOD_DAYS, netRevenue);
  const recentOrders = orderRows.slice(0, 6);
  const revenueSeries = buildRevenueSeries(orderRows);

  return (
    <PageContainer>
      <PageHeader
        title="Overview"
        description="Live operations summary for KFD across Kabankalan City Proper."
      />

      <Stack gap={6}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Section aria-label="Orders right now">
            <Card className="h-full">
              <CardHeader title="Right now" subtitle="Open orders by stage" />
              <dl className="grid grid-cols-3 gap-2 px-5 pb-5 text-center">
                <LiveCount label="New" value={live.pending} />
                <LiveCount label="In kitchen" value={live.kitchen} />
                <LiveCount label="On the road" value={live.onTheRoad} />
              </dl>
            </Card>
          </Section>

          <Section aria-label="Needs attention" className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader
                title="Needs attention"
                subtitle={attention.length === 0 ? undefined : "Most urgent first"}
              />
              <div className="px-5 pb-4">
                {attention.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    All clear. Nothing is waiting on staff.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/70">
                    {attention.map((item) => (
                      <li key={item.key}>
                        <Link
                          href={item.href}
                          className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary"
                        >
                          <span className="text-card-foreground">{item.label}</span>
                          <span className="flex items-center gap-2">
                            <Badge variant={item.urgent ? "destructive" : "secondary"} size="sm">
                              {item.count}
                            </Badge>
                            <ArrowRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </Section>
        </div>

        <WaitingForRider
          orders={orderRows}
          deliveries={deliveries.data ?? []}
          now={now}
          onChanged={() => {
            void orders.refetch();
            void deliveries.refetch();
          }}
        />

        <Section aria-label="Key metrics">
          <StatGrid>
            {kpis.map((kpi) => (
              <StatCard key={kpi.label} kpi={kpi} />
            ))}
          </StatGrid>
        </Section>

        <Section aria-label="Revenue">
          <Card>
            <CardHeader
              title="Weekly revenue"
              subtitle="Orders and net revenue, last 7 days"
            />
            <RevenueChart data={revenueSeries} />
          </Card>
        </Section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section aria-label="Recent orders">
            <Card>
              <CardHeader
                title="Recent orders"
                subtitle="The latest orders across all restaurants"
                action={
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/dashboard/orders">
                      View all
                      <ArrowRightIcon className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                }
              />
              <ul className="divide-y divide-border/70 px-5 pb-2">
                {recentOrders.length === 0 ? (
                  <li className="py-8 text-center text-sm text-muted-foreground">No orders yet.</li>
                ) : (
                  recentOrders.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-3 py-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <Avatar name={o.customer} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-card-foreground">
                            {o.reference} · {o.restaurant}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {o.customer} · {formatShortDate(o.placedAt)}
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold text-card-foreground">
                          {formatCurrency(o.total)}
                        </span>
                        <StatusBadge status={o.status} />
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </Card>
          </Section>

          <Section aria-label="Top restaurants">
            <Card>
              <CardHeader
                title="Top restaurants"
                subtitle={`By net revenue, last ${PERIOD_DAYS} days`}
                action={
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/dashboard/restaurants">
                      View all
                      <ArrowRightIcon className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                }
              />
              <ul className="divide-y divide-border/70 px-5 pb-2">
                {top.length === 0 ? (
                  <li className="py-8 text-center text-sm text-muted-foreground">
                    No delivered orders this week.
                  </li>
                ) : (
                  top.map((r) => (
                    <li key={r.name} className="flex items-center justify-between gap-3 py-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <Avatar name={r.name} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-card-foreground">
                            {r.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {r.orders} delivered {r.orders === 1 ? "order" : "orders"}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-card-foreground">
                        {formatCurrency(r.revenue)}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </Card>
          </Section>
        </div>
      </Stack>
    </PageContainer>
  );
}

function LiveCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-3">
      <dd className="text-2xl font-semibold tabular-nums text-card-foreground">{value}</dd>
      <dt className="mt-0.5 text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}
