"use client";

import { fetchMerchantOrders } from "@/lib/supabase/merchant-queries";
import { useAsyncData } from "@/lib/use-async-data";
import { PageContainer, PageHeader, StatGrid } from "@/components/layout/page";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableBoundary } from "@/components/ui/table-boundary";
import { downloadCsv, timestampedFilename } from "@/lib/csv";
import { formatCurrency } from "@/lib/format";
import { salesByDay, totalOf, type SalesDay } from "@/lib/merchant-sales";

const DAYS = 30;

const dayFormat = new Intl.DateTimeFormat("en-PH", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

/** "Mon, Oct 19" from a local YYYY-MM-DD key, without a UTC round trip. */
function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return dayFormat.format(new Date(y, m - 1, d));
}

/** What the kitchen sold, per day, from delivered orders only. */
export default function MerchantSalesPage() {
  const orders = useAsyncData(() => fetchMerchantOrders());
  const rows = salesByDay(orders.data ?? [], DAYS, new Date());
  const week = totalOf(rows, 7);
  const month = totalOf(rows, DAYS);

  return (
    <PageContainer>
      <PageHeader
        title="Sales"
        description="Food sales from delivered orders. Delivery and service fees are not included, and commission is not deducted."
      />

      <TableBoundary
        loading={orders.loading}
        error={orders.error}
        onRetry={orders.refetch}
        errorTitle="Could not load your sales"
        skeletonRows={6}
        skeletonColumns={3}
      >
        <StatGrid className="mb-6">
          <StatCard kpi={{ label: "Sales, last 7 days", value: formatCurrency(week.sales), hint: "Food subtotal" }} />
          <StatCard kpi={{ label: "Orders, last 7 days", value: String(week.orders), hint: "Delivered" }} />
          <StatCard kpi={{ label: "Sales, last 30 days", value: formatCurrency(month.sales), hint: "Food subtotal" }} />
          <StatCard kpi={{ label: "Orders, last 30 days", value: String(month.orders), hint: "Delivered" }} />
        </StatGrid>

        <Card>
          <CardHeader
            title="By day"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadCsv<SalesDay>(timestampedFilename("kfd-sales"), rows, [
                    { key: "date", header: "Date" },
                    { key: "orders", header: "Delivered orders" },
                    { key: "sales", header: "Food sales (PHP)" },
                  ])
                }
              >
                Download CSV
              </Button>
            }
          />
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 font-medium">Day</th>
                  <th className="py-2 text-right font-medium">Orders</th>
                  <th className="py-2 text-right font-medium">Food sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.date} className={row.orders === 0 ? "text-muted-foreground" : ""}>
                    <td className="py-2">{dayLabel(row.date)}</td>
                    <td className="py-2 text-right tabular-nums">{row.orders}</td>
                    <td className="py-2 text-right tabular-nums">{formatCurrency(row.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </TableBoundary>
    </PageContainer>
  );
}
