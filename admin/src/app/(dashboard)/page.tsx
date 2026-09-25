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
import type { Order, Restaurant } from "@/lib/types";

function useDashboardData() {
  const orders = useAsyncData(() => fetchOrders());
  const restaurants = useAsyncData(() => fetchRestaurants());
  const riders = useAsyncData(() => fetchRiders());

  return { orders, restaurants, riders };
}

const PERIOD_DAYS = 7;

/**
 * Percent change from the previous period. Returns 0 when there is no prior
 * data to compare against rather than a misleading infinity.
 */
function periodDelta(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

function splitPeriods(orders: Order[], restaurants: Restaurant[]) {
  const now = Date.now();
  const window = PERIOD_DAYS * 24 * 60 * 60 * 1000;
  const currentStart = now - window;
  const previousStart = now - window * 2;

  const inRange = (iso: string, start: number, end: number) => {
    const t = new Date(iso).getTime();
    return t >= start && t < end;
  };

  const currentOrders = orders.filter((o) => inRange(o.placedAt, currentStart, now));
  const previousOrders = orders.filter((o) =>
    inRange(o.placedAt, previousStart, currentStart),
  );

  return {
    revenue: {
      current: currentOrders.reduce((s, o) => s + o.total, 0),
      previous: previousOrders.reduce((s, o) => s + o.total, 0),
    },
    orders: { current: currentOrders.length, previous: previousOrders.length },
    restaurants: {
      current: restaurants.filter(
        (r) => r.status === "active" && inRange(r.joinedAt, currentStart, now),
      ).length,
      previous: restaurants.filter(
        (r) =>
          r.status === "active" &&
          inRange(r.joinedAt, previousStart, currentStart),
      ).length,
    },
  };
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

  const activeRestaurants = restaurantRows.filter((r) => r.status === "active").length;
  const onlineRiders = riderRows.filter((r) => r.status === "online").length;
  const grossRevenue = orderRows.reduce((sum, o) => sum + o.total, 0);

  const deltas = splitPeriods(orderRows, restaurantRows);
  const delivered = orderRows.filter((o) => o.status === "delivered").length;
  const deliveredRate =
    orderRows.length === 0 ? 0 : Math.round((delivered / orderRows.length) * 100);

  const kpis = [
    {
      label: "Gross Revenue",
      value: formatCurrency(grossRevenue),
      delta: periodDelta(deltas.revenue.current, deltas.revenue.previous),
      hint: "vs prev 7 days",
    },
    {
      label: "Total Orders",
      value: orderRows.length.toLocaleString(),
      delta: periodDelta(deltas.orders.current, deltas.orders.previous),
      hint: "vs prev 7 days",
    },
    {
      label: "Active Restaurants",
      value: activeRestaurants.toString(),
      delta: periodDelta(
        deltas.restaurants.current,
        deltas.restaurants.previous,
      ),
      hint: "new vs prev 7 days",
    },
    {
      label: "Riders Online",
      value: onlineRiders.toString(),
      delta: deliveredRate,
      hint: "delivery success rate",
    },
  ] as const;

  const topRestaurants = restaurantRows
    .slice()
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
                subtitle="By gross revenue this month"
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

function buildRevenueSeries(orders: Order[]) {
  const days = new Map<string, { label: string; orders: number; revenue: number }>();
  const formatter = new Intl.DateTimeFormat("en", { weekday: "short" });

  for (const o of orders) {
    const date = new Date(o.placedAt);
    const key = date.toDateString();
    const entry = days.get(key) ?? { label: formatter.format(date), orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue += o.total;
    days.set(key, entry);
  }

  const points = Array.from(days.values());
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  for (const label of labels) {
    if (!points.some((p) => p.label === label)) {
      points.push({ label, orders: 0, revenue: 0 });
    }
  }
  return points.sort(
    (a, b) => labels.indexOf(a.label) - labels.indexOf(b.label),
  );
}