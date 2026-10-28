"use client";

import { useState } from "react";
import { fetchOrders } from "@/lib/supabase/queries";
import { fetchCommission } from "@/lib/supabase/settlement-queries";
import { useAsyncData } from "@/lib/use-async-data";
import {
  PageContainer,
  PageHeader,
  Section,
  Stack,
  StatGrid,
} from "@/components/layout/page";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState } from "@/components/ui/status";
import { StatusBadge } from "@/components/ui/status-badge";
import { RevenueChart } from "@/components/charts/revenue-chart";
import { RangeFilter, type RangeValue } from "@/components/range-filter";
import { Toolbar } from "@/components/toolbar";
import { downloadCsv, timestampedFilename, type CsvColumn } from "@/lib/csv";
import { formatCurrency } from "@/lib/format";
import {
  buildReport,
  presetRange,
  shiftDays,
  type ReportDay,
  type ReportShop,
} from "@/lib/report-metrics";

const SHOP_COLUMNS: CsvColumn<ReportShop>[] = [
  { key: "restaurant", header: "Restaurant" },
  { key: "orders", header: "Delivered orders" },
  { key: "gross", header: "Gross order value (PHP)" },
  { key: "refunds", header: "Refunds (PHP)" },
  { key: "foodSales", header: "Food sales, net of refunds (PHP)" },
  { key: "commission", header: "Commission (PHP)" },
  { key: "owed", header: "Owed to shop (PHP)" },
];

const DAY_COLUMNS: CsvColumn<ReportDay>[] = [
  { key: "date", header: "Date" },
  { key: "orders", header: "Delivered orders" },
  { key: "netRevenue", header: "Net revenue (PHP)" },
  { key: "refunds", header: "Refunds (PHP)" },
];

/**
 * Money over a chosen period.
 *
 * The Overview answers "what is happening right now" with rolling 7-day
 * windows. That is the wrong instrument for a month, a quarter, or the week
 * the owner is reconciling against the bank: there is no range to ask for, no
 * total per shop and nothing to export.
 *
 * Everything here comes from the same definitions the rest of the app uses --
 * delivered orders only, net of refunds, commission on food (0138) -- so the
 * page cannot disagree with the settlement screen. See report-metrics.ts.
 */
export default function ReportsPage() {
  const [range, setRange] = useState<RangeValue>(() => presetRange(30, new Date()));

  const report = useAsyncData(async () => {
    // One day either side of the chosen range. The Supabase bound is a
    // timestamptz compared against a date string, which Postgres reads in UTC,
    // so the first eight hours of each local day would fall outside it.
    // `buildReport` decides membership itself by local day, so the wider fetch
    // is only a superset.
    const [orders, commissionPct] = await Promise.all([
      fetchOrders({ from: shiftDays(range.from, -1), to: shiftDays(range.to, 1) }),
      fetchCommission(),
    ]);
    return buildReport(orders, commissionPct, range.from, range.to);
  }, `${range.from}:${range.to}`);

  const data = report.data;

  return (
    <PageContainer>
      <PageHeader
        title="Reports"
        description="Revenue, refunds and what each shop is owed over a period you choose."
      />

      <Stack gap={6}>
        <Section aria-label="Date range">
          <Toolbar className="mb-0">
            <RangeFilter value={range} onChange={setRange} />
          </Toolbar>
        </Section>

        {report.error ? (
          <EmptyState
            title="Could not load the report"
            description={report.error}
            action={
              <Button variant="outline" onClick={report.refetch}>
                Retry
              </Button>
            }
          />
        ) : !data ? (
          <LoadingState label="Totalling the period…" />
        ) : data.days.length === 0 ? (
          <EmptyState
            title="That range has no days"
            description="Choose a start date on or before the end date."
          />
        ) : (
          <>
            {data.totals.orders === 0 ? (
              <Section aria-label="Empty period">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-card) border border-border bg-muted/30 p-4 text-sm">
                  <p className="text-muted-foreground">
                    No delivered orders in this period. Only delivered orders count
                    as revenue, so every total below is zero.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRange(presetRange(90, new Date()))}
                  >
                    Try the last 90 days
                  </Button>
                </div>
              </Section>
            ) : null}

            <Section aria-label="Totals">
              <StatGrid>
                <StatCard
                  kpi={{
                    label: "Net revenue",
                    value: formatCurrency(data.totals.netRevenue),
                    hint: `${data.totals.orders} delivered ${
                      data.totals.orders === 1 ? "order" : "orders"
                    }, net of ${formatCurrency(data.totals.refunds)} refunded`,
                  }}
                />
                <StatCard
                  kpi={{
                    label: "Gross order value",
                    value: formatCurrency(data.totals.gross),
                    hint: `before refunds · ${data.totals.cancelled} cancelled in range`,
                  }}
                />
                <StatCard
                  kpi={{
                    label: "Average order",
                    value: formatCurrency(data.totals.averageOrderValue),
                    hint: "net revenue ÷ delivered orders",
                  }}
                />
                <StatCard
                  kpi={{
                    label: "Refunds",
                    value: formatCurrency(data.totals.refunds),
                    hint: "customer money returned in this period",
                  }}
                />
                <StatCard
                  kpi={{
                    label: "Commission earned",
                    value: formatCurrency(data.totals.commission),
                    hint: "KFD's cut of food sales, at the current rate",
                  }}
                />
                <StatCard
                  kpi={{
                    label: "Owed to shops",
                    value: formatCurrency(data.totals.owedToShops),
                    hint: "food sales less commission · payouts page settles it",
                  }}
                />
              </StatGrid>
            </Section>

            <Section aria-label="Daily revenue">
              <Card>
                <CardHeader
                  title="Daily net revenue"
                  subtitle={`Delivered orders, net of refunds · ${data.days.length} ${
                    data.days.length === 1 ? "day" : "days"
                  }`}
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadCsv<ReportDay>(
                          timestampedFilename("kfd-daily-revenue"),
                          data.days,
                          DAY_COLUMNS,
                        )
                      }
                    >
                      Download CSV
                    </Button>
                  }
                />
                <RevenueChart
                  data={data.days.map((day) => ({
                    label: day.label,
                    orders: day.orders,
                    revenue: day.netRevenue,
                  }))}
                  periodLabel={`from ${range.from} to ${range.to}`}
                />
              </Card>
            </Section>

            <Section aria-label="Orders by status">
              <Card>
                <CardHeader
                  title="Orders by status"
                  subtitle="Every order placed in the period, whatever its outcome"
                />
                <div className="flex flex-wrap gap-2 px-5 pb-5">
                  {data.statuses.length === 0 ? (
                    <p className="py-2 text-sm text-muted-foreground">
                      No orders in this period.
                    </p>
                  ) : (
                    data.statuses.map((row) => (
                      <span
                        key={row.status}
                        className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
                      >
                        <StatusBadge status={row.status} />
                        <span className="font-semibold tabular-nums text-card-foreground">
                          {row.count}
                        </span>
                      </span>
                    ))
                  )}
                </div>
              </Card>
            </Section>

            <Section aria-label="By restaurant">
              <Card>
                <CardHeader
                  title="By restaurant"
                  subtitle="Food sales are net of the refund that lands on the food; commission is not deducted from the refund column."
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={data.shops.length === 0}
                      onClick={() =>
                        downloadCsv<ReportShop>(
                          timestampedFilename("kfd-shop-revenue"),
                          data.shops,
                          SHOP_COLUMNS,
                        )
                      }
                    >
                      Download CSV
                    </Button>
                  }
                />
                <div className="overflow-x-auto px-5 pb-5">
                  <table className="w-full min-w-max text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Shop</th>
                        <th className="py-2 px-3 text-right font-medium">Orders</th>
                        <th className="py-2 px-3 text-right font-medium">Gross</th>
                        <th className="py-2 px-3 text-right font-medium">Refunds</th>
                        <th className="py-2 px-3 text-right font-medium">Food sales</th>
                        <th className="py-2 px-3 text-right font-medium">Commission</th>
                        <th className="py-2 pl-3 text-right font-medium">Owed to shop</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.shops.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="py-6 text-center text-muted-foreground"
                          >
                            No delivered orders in this period.
                          </td>
                        </tr>
                      ) : (
                        data.shops.map((shop) => (
                          <tr key={shop.restaurant}>
                            <td className="py-2 pr-4 font-medium text-card-foreground">
                              {shop.restaurant}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums">
                              {shop.orders}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums">
                              {formatCurrency(shop.gross)}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums">
                              {formatCurrency(shop.refunds)}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums">
                              {formatCurrency(shop.foodSales)}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums">
                              {formatCurrency(shop.commission)}
                            </td>
                            <td className="py-2 pl-3 text-right font-semibold tabular-nums text-card-foreground">
                              {formatCurrency(shop.owed)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </Section>
          </>
        )}
      </Stack>
    </PageContainer>
  );
}
