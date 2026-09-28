"use client";

import Link from "next/link";
import { fetchOrders, fetchRestaurants, fetchRiders } from "@/lib/supabase/queries";
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
  periodDelta,
  splitPeriods,
  PERIOD_DAYS,
} from "@/lib/dashboard-metrics";
import type { Kpi } from "@/lib/types";

function useDashboardData() {
  const orders = useAsyncData(() => fetchOrders());
  const restaurants = useAsyncData(() => fetchRestaurants());
  const riders = useAsyncData(() => fetchRiders());

  return { orders, restaurants, riders };
}

export default function OverviewPage() {
  const { orders, restaurants, riders } = useDashboardData();

  const loading =
    orders.loading || restaurants.loading || riders.loading;
  const error = orders.error ?? restaurants.error ?? riders.error;

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
        <EmptyState
          title="Could not load dashboard data"
          description={error}
        />
      </PageContainer>
    );
  }

  const orderRows = orders.data ?? [];
  const restaurantRows = restaurants.data ?? [];
  const riderRows = riders.data ?? [];

  const onlineRiders = riderRows.filter((r) => r.status === "online").length;

  const deltas = splitPeriods(orderRows, restaurantRows);
  const delivered = orderRows.filter((o) => o.status === "delivered").length;
  const deliveredRate =
    orderRows.length === 0 ? 0 : Math.round((delivered / orderRows.length) * 100);

  // Window policy (Prompt 2.1): every KPI's value and delta describe the SAME
  // period. A flow metric (revenue, order count) is windowed to the last 7 days
  // so the number and its "vs prev 7 days" arrow agree. A stock metric (riders
  // online) reports the current level and carries no delta at all, because
  // `riders` has no timestamp on status changes and therefore no derivable
  // previous value to compare against.
  const WINDOW_LABEL = `(${PERIOD_DAYS}d)`;

  const kpis = [
    {
      label: `Gross Revenue ${WINDOW_LABEL}`,
      value: formatCurrency(deltas.revenue.current),
      delta: periodDelta(deltas.revenue.current, deltas.revenue.previous),
      hint: "vs prev 7 days",
    },
    {
      label: `Orders ${WINDOW_LABEL}`,
      value: deltas.orders.current.toLocaleString(),
      delta: periodDelta(deltas.orders.current, deltas.orders.previous),
      hint: "vs prev 7 days",
    },
    {
      // Renamed from "Active Restaurants": the value shown here is restaurants
      // that *became active* inside the window, so the old label was claiming a
      // standing total the number did not represent. See splitPeriods.
      label: `New Restaurants ${WINDOW_LABEL}`,
      value: deltas.restaurants.current.toLocaleString(),
      delta: periodDelta(
        deltas.restaurants.current,
        deltas.restaurants.previous,
      ),
      hint: "vs prev 7 days",
    },
    {
      // No delta: a headcount is a level, and the delivery success rate that
      // used to sit in this trend slot is unrelated to the number above it
      // (Prompt 2.3). The rate is surfaced as neutral hint text, not an arrow.
      label: "Riders Online",
      value: onlineRiders.toLocaleString(),
      hint: `delivery success ${deliveredRate}%`,
    },
  ] satisfies readonly Kpi[];

  // `revenue` is live since migration 0008 (recomputed on every order change,
  // cancelled orders excluded) but it is a lifetime total, which is why the
  // subtitle says "all time" rather than the "this month" it used to claim.
  // The "Live" badge sits on the revenue *chart*, which is genuinely computed
  // from live order rows for the last 7 days.
  //
  // Archived restaurants are excluded. Their lifetime revenue stays exactly
  // where it is -- archiving is reversible and destroys nothing -- but
  // "top restaurants" is a shortlist of who to watch, and a row someone
  // deliberately removed from the restaurant list has no business leading it.
  const topRestaurants = restaurantRows
    .filter((r) => !r.archivedAt)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const recentOrders = orderRows.slice(0, 6);
  const revenueSeries = buildRevenueSeries(orders.data ?? []);

  return (
    <PageContainer>
      <PageHeader
        title="Overview"
        description="Live operations summary for KFD across Kabankalan City Proper."
      />

      <Stack gap={6}>
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
              subtitle="Orders and gross revenue, last 7 days"
              action={<Badge variant="primary">Live</Badge>}
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
                    <Link href="/orders">
                      View all
                      <ArrowRightIcon className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                }
              />
              <ul className="divide-y divide-border/70 px-5 pb-2">
                {recentOrders.length === 0 ? (
                  <li className="py-8 text-center text-sm text-muted-foreground">
                    No orders yet.
                  </li>
                ) : (
                  recentOrders.map((o) => (
                    <li
                      key={o.id}
                      className="flex items-center justify-between gap-3 py-3"
                    >
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
                subtitle="By gross revenue, all time"
                action={
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/restaurants">
                      View all
                      <ArrowRightIcon className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                }
              />
              <ul className="divide-y divide-border/70 px-5 pb-2">
                {topRestaurants.length === 0 ? (
                  <li className="py-8 text-center text-sm text-muted-foreground">
                    No restaurants yet.
                  </li>
                ) : (
                  topRestaurants.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <Avatar name={r.name} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-card-foreground">
                            {r.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {r.cuisine} · {r.city}
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold text-card-foreground">
                          {formatCurrency(r.revenue)}
                        </span>
                        <Badge variant="secondary" size="sm">
                          {r.rating} ★
                        </Badge>
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
