"use client";

import { useMemo, useState } from "react";
import { fetchRefunds } from "@/lib/supabase/feedback-queries";
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
import { Badge } from "@/components/ui/badge";
import { EmptyState, LoadingState } from "@/components/ui/status";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { RangeFilter, type RangeValue } from "@/components/range-filter";
import { Toolbar, ToolbarSearch } from "@/components/toolbar";
import { downloadCsv, timestampedFilename, type CsvColumn } from "@/lib/csv";
import { endOfLocalDay, isWithinRange, parseLocalDate } from "@/lib/merchant-order-range";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { presetRange, shiftDays } from "@/lib/report-metrics";
import {
  matchesRefund,
  summarizeRefunds,
  type RefundEntry,
  type RefundMethod,
} from "@/lib/refund-ledger";

const PAGE_SIZE = 15;

const CSV_COLUMNS: CsvColumn<RefundEntry>[] = [
  { key: "createdAt", header: "Refunded at", format: (row) => row.createdAt.slice(0, 10) },
  { key: "reference", header: "Order" },
  { key: "customer", header: "Customer" },
  { key: "restaurant", header: "Shop" },
  { key: "method", header: "Method" },
  { key: "amount", header: "Amount (PHP)" },
  { key: "reason", header: "Reason" },
];

const columns: Column<RefundEntry>[] = [
  {
    key: "createdAt",
    header: "Date",
    cell: (row) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {formatShortDate(row.createdAt)}
      </span>
    ),
  },
  {
    key: "reference",
    header: "Order",
    cell: (row) => <span className="font-medium text-card-foreground">{row.reference}</span>,
  },
  { key: "customer", header: "Customer", cell: (row) => row.customer },
  { key: "restaurant", header: "Shop", cell: (row) => row.restaurant },
  {
    key: "method",
    header: "Method",
    cell: (row) => (
      <Badge variant={row.method === "cash" ? "warning" : "info"} size="sm">
        {row.method === "cash" ? "Cash" : "GCash"}
      </Badge>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    align: "right",
    cell: (row) => (
      <span className="font-semibold tabular-nums text-card-foreground">
        {formatCurrency(row.amount)}
      </span>
    ),
  },
  { key: "reason", header: "Reason", cell: (row) => row.reason },
];

/**
 * Every refund, in one ledger.
 *
 * A refund could only be seen from inside the order it belonged to. That is the
 * right place to record one and the wrong place to audit a month: the totals,
 * the methods, and which reason keeps recurring were only answerable by opening
 * orders one at a time, which in practice meant they were never answered.
 *
 * The KPI strip describes the whole chosen period; the table below it is what
 * the search and method filters narrow. Typing in the search must not silently
 * change the total at the top -- a number that moves while you look for a
 * single row is worse than no number.
 */
export default function RefundsPage() {
  // 90 days is the default: refunds are rare enough that a week usually shows
  // none, and an empty ledger teaches an operator nothing.
  const [range, setRange] = useState<RangeValue>(() => presetRange(90, new Date()));
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState<"all" | RefundMethod>("all");
  const [page, setPage] = useState(1);

  const refunds = useAsyncData(
    // A day either side: the SQL bound is UTC and would drop the first eight
    // local hours of the range. `inRange` below decides membership by local day.
    () => fetchRefunds({ from: shiftDays(range.from, -1), to: shiftDays(range.to, 1) }),
    `${range.from}:${range.to}`,
  );
  // Stable identity: `refunds.data ?? []` would be a new array every render and
  // re-run every memo below it.
  const rows = useMemo(() => refunds.data ?? [], [refunds.data]);

  // The SQL range bounds `created_at` in UTC; a refund at 1am local would land
  // in the wrong day, so membership is decided again on local-day instants.
  const bounds = useMemo(
    () => ({
      from: parseLocalDate(range.from),
      to: endOfLocalDay(range.to),
    }),
    [range.from, range.to],
  );

  const inRange = useMemo(
    () => rows.filter((row) => isWithinRange(row.createdAt, bounds)),
    [rows, bounds],
  );

  const summary = useMemo(() => summarizeRefunds(inRange), [inRange]);

  const filtered = useMemo(
    () => inRange.filter((row) => matchesRefund(row, { query, method })),
    [inRange, query, method],
  );

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  return (
    <PageContainer>
      <PageHeader
        title="Refunds"
        description="Every cent returned to a customer, with the order, the shop and the reason."
      />

      <Stack gap={6}>
        <Section aria-label="Filters">
          <Toolbar className="mb-0">
            <RangeFilter
              value={range}
              onChange={(next) => {
                setRange(next);
                setPage(1);
              }}
            />
          </Toolbar>
        </Section>

        {refunds.error ? (
          <EmptyState
            title="Could not load the refunds"
            description={refunds.error}
            action={
              <Button variant="outline" onClick={refunds.refetch}>
                Retry
              </Button>
            }
          />
        ) : !refunds.data ? (
          <LoadingState label="Loading refunds…" />
        ) : (
          <>
            <Section aria-label="Totals">
              <StatGrid>
                <StatCard
                  kpi={{
                    label: "Refunded",
                    value: formatCurrency(summary.total),
                    hint: `${summary.count} ${summary.count === 1 ? "refund" : "refunds"} in this period`,
                  }}
                />
                <StatCard
                  kpi={{
                    label: "Cash refunded",
                    value: formatCurrency(summary.cash),
                    hint: "out of the rider's cash position",
                  }}
                />
                <StatCard
                  kpi={{
                    label: "GCash refunded",
                    value: formatCurrency(summary.gcash),
                    hint: "returned electronically",
                  }}
                />
                <StatCard
                  kpi={{
                    label: "Average refund",
                    value: formatCurrency(summary.average),
                    hint: "per refund, not per order",
                  }}
                />
              </StatGrid>
            </Section>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Section aria-label="Refund ledger" className="xl:col-span-2">
                <Card>
                  <CardHeader
                    title="Refund ledger"
                    subtitle={
                      filtered.length === inRange.length
                        ? `${inRange.length} ${inRange.length === 1 ? "refund" : "refunds"}`
                        : `${filtered.length} of ${inRange.length} shown`
                    }
                    action={
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={filtered.length === 0}
                        onClick={() =>
                          downloadCsv(
                            timestampedFilename("kfd-refunds"),
                            filtered,
                            CSV_COLUMNS,
                          )
                        }
                      >
                        Download CSV
                      </Button>
                    }
                  />

                  <div className="px-5 pb-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <ToolbarSearch
                        value={query}
                        onChange={(value) => {
                          setQuery(value);
                          setPage(1);
                        }}
                        placeholder="Order, customer, shop or reason"
                        ariaLabel="Search refunds"
                      />
                      <Select
                        value={method}
                        onChange={(event) => {
                          setMethod(event.target.value as "all" | RefundMethod);
                          setPage(1);
                        }}
                        className="w-full sm:w-40"
                      >
                        <option value="all">All methods</option>
                        <option value="cash">Cash</option>
                        <option value="gcash">GCash</option>
                      </Select>
                    </div>
                  </div>

                  {filtered.length === 0 ? (
                    <EmptyState
                      title={inRange.length === 0 ? "No refunds in this period" : "No match"}
                      description={
                        inRange.length === 0
                          ? "Nothing went back to a customer in the dates chosen."
                          : "Try a different search, method or date range."
                      }
                      className="m-5"
                    />
                  ) : (
                    <>
                      <DataTable columns={columns} rows={pageRows} />
                      <Pagination
                        page={currentPage}
                        pageSize={PAGE_SIZE}
                        total={filtered.length}
                        onPageChange={setPage}
                      />
                    </>
                  )}
                </Card>
              </Section>

              <Section aria-label="Why refunds happen">
                <Card className="h-full">
                  <CardHeader
                    title="Why refunds happen"
                    subtitle="Grouped by reason, however it was typed"
                  />
                  <ul className="divide-y divide-border/70 px-5 pb-4">
                    {summary.topReasons.length === 0 ? (
                      <li className="py-6 text-sm text-muted-foreground">
                        No refunds to group.
                      </li>
                    ) : (
                      summary.topReasons.map((reason) => (
                        <li
                          key={reason.reason}
                          className="flex items-center justify-between gap-3 py-3 text-sm"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-card-foreground">
                              {reason.reason}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {reason.count} {reason.count === 1 ? "refund" : "refunds"}
                            </span>
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums text-card-foreground">
                            {formatCurrency(reason.total)}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </Card>
              </Section>
            </div>
          </>
        )}
      </Stack>
    </PageContainer>
  );
}
