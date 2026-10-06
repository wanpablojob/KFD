"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  fetchCustomerStats,
  fetchCustomerStatsTotals,
} from "@/lib/supabase/customer-queries";
import { formatCurrency } from "@/lib/format";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { PaginatedDataTable } from "@/components/ui/paginated-data-table";
import type { Column, SortState } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { useAsyncData } from "@/lib/use-async-data";
import { TableBoundary } from "@/components/ui/table-boundary";
import { tierLabelFor, tierForSpend } from "@/lib/customer-tier";
import type { CustomerStats } from "@/lib/customer-stats";
import {
  CUSTOMER_STATE_FILTERS,
  CUSTOMER_TIER_FILTERS,
  customerListParamsToSearch,
  customerViewChangeResetsPage,
  parseCustomerListParams,
  type CustomerStateFilter,
  type CustomerTierFilter,
  type SortDir,
} from "@/lib/customer-list-params";

const columns: Column<CustomerStats>[] = [
  {
    key: "name",
    header: "Customer",
    cell: (row) => (
      <span className="flex items-center gap-2.5">
        <Avatar name={row.name} size="sm" />
        <span>
          <span className="block font-medium text-card-foreground">
            {row.name}
          </span>
          <span className="block text-xs text-muted-foreground">{row.email}</span>
        </span>
      </span>
    ),
  },
  { key: "city", header: "City", cell: (row) => row.city },
  {
    key: "tier",
    header: "Tier",
    cell: (row) => {
      const tier = tierLabelFor(row.totalSpend);
      return (
        <Badge
          variant={
            tier === "Gold" ? "warning" : tier === "Silver" ? "secondary" : "outline"
          }
          size="sm"
        >
          {tier}
        </Badge>
      );
    },
  },
  {
    key: "ordersCount",
    header: "Orders",
    align: "right",
    cell: (row) => <span className="text-card-foreground">{row.linked ? row.ordersCount : "—"}</span>,
  },
  {
    key: "totalSpend",
    header: "Total spent",
    align: "right",
    cell: (row) => (
      <span className="font-medium text-card-foreground">
        {row.totalSpend === null ? "—" : formatCurrency(row.totalSpend)}
      </span>
    ),
  },
  {
    key: "lastOrderAt",
    header: "Last order",
    cell: (row) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {row.lastOrderAt ? row.lastOrderAt.slice(0, 10) : "—"}
      </span>
    ),
  },
  {
    key: "joinedAt",
    header: "Joined",
    cell: (row) => (
      <span className="whitespace-nowrap text-muted-foreground">{row.joinedAt}</span>
    ),
  },
];

export default function CustomersPage() {
  const router = useRouter();
  const search = useSearchParams().toString();
  const params = parseCustomerListParams(search);

  const statsQuery = useAsyncData(() => fetchCustomerStats());
  const totalsQuery = useAsyncData(() => fetchCustomerStatsTotals());

  // Memoised so the filter useMemo below does not see a fresh array on every
  // render, which would re-filter and re-sort the whole table each time.
  const rows = useMemo(() => statsQuery.data ?? [], [statsQuery.data]);

  // Cities come from the data rather than a hard-coded list: the seed rows and
  // the accounts that exist disagree, and a city filter that offers a city with
  // nobody in it is worse than no filter.
  const cities = useMemo(() => {
    const seen = new Set<string>();
    for (const row of rows) if (row.city) seen.add(row.city);
    return [...seen].sort();
  }, [rows]);

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        if (params.tier !== "all") {
          const tier = tierForSpend(row.totalSpend);
          if (tier === null) return false;
          if (tier.toLowerCase() !== params.tier) return false;
        }
        if (params.city && row.city !== params.city) return false;
        if (params.state === "blocked" && row.blockedAt === null) return false;
        if (params.state === "active" && row.blockedAt !== null) return false;
        if (params.state === "archived" && row.archivedAt === null) return false;
        return true;
      }),
    [rows, params.tier, params.city, params.state],
  );

  function update(next: Partial<typeof params>) {
    const merged = { ...params, ...next };
    if (customerViewChangeResetsPage(params, merged)) merged.page = 1;
    const qs = customerListParamsToSearch(merged);
    router.push(`/dashboard/customers${qs}`);
  }

  const totals = totalsQuery.data;
  const sortState: SortState = { key: params.sort, dir: params.dir };

  return (
    <PageContainer>
      <PageHeader
        title="Customers"
        description="Registered customers and their order activity."
      />

      <Section aria-label="Customer totals">
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            kpi={{
              label: "Total customers",
              value: totals ? String(totals.totalCustomers) : "—",
              hint: "Not archived",
            }}
          />
          <StatCard
            kpi={{
              label: "New this month",
              value: totals ? String(totals.newThisMonth) : "—",
              hint: "Joined since the 1st",
            }}
          />
          <StatCard
            kpi={{
              label: "Active this month",
              value: totals ? String(totals.activeThisMonth) : "—",
              hint: "Placed an order",
            }}
          />
          {/* Walk-ins have no customer account, so they appear in nobody's row.
              Surfacing them here is the only place they can be seen without
              inventing an owner for them. */}
          <StatCard
            kpi={{
              label: "Walk-in orders",
              value: totals ? String(totals.walkInOrders) : "—",
              hint: totals
                ? `No account · ${formatCurrency(totals.walkInSpend)}`
                : "No account",
            }}
          />
        </div>
      </Section>

      <Section aria-label="Customer list">
        <TableBoundary
          loading={statsQuery.loading}
          error={statsQuery.error}
          onRetry={statsQuery.refetch}
          errorTitle="Could not load customers"
          skeletonRows={8}
          skeletonColumns={7}
        >
          <Card className="overflow-hidden">
            <CustomerStatsNote />
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
              <Select
                aria-label="Filter by tier"
                className="h-9 w-36"
                value={params.tier}
                onChange={(e) =>
                  update({ tier: e.target.value as CustomerTierFilter })
                }
              >
                {CUSTOMER_TIER_FILTERS.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier === "all" ? "All tiers" : tier}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Filter by city"
                className="h-9 w-52"
                value={params.city || "all"}
                onChange={(e) =>
                  update({ city: e.target.value === "all" ? "" : e.target.value })
                }
              >
                <option value="all">All cities</option>
                {cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Filter by status"
                className="h-9 w-40"
                value={params.state}
                onChange={(e) =>
                  update({ state: e.target.value as CustomerStateFilter })
                }
              >
                {CUSTOMER_STATE_FILTERS.map((state) => (
                  <option key={state} value={state}>
                    {state === "all" ? "All customers" : state}
                  </option>
                ))}
              </Select>
            </div>
            <PaginatedDataTable<CustomerStats>
              columns={columns}
              rows={visible}
              searchFields={["name", "email", "phone", "city", "id"]}
              onRowClick={(row) => router.push(`/dashboard/customers/${row.id}`)}
              emptyTitle="No customers found"
              exportName="/dashboard/customers"
              // The CSV is built from the same rows the table is showing, so it
              // carries the filters and the sort rather than the whole table.
              exportColumns={[
                { key: "name", header: "Customer" },
                { key: "email", header: "Email" },
                { key: "phone", header: "Phone (customer record)" },
                { key: "city", header: "City" },
                { key: "totalSpend", header: "Tier", format: (row) => tierLabelFor(row.totalSpend) },
                { key: "ordersCount", header: "Orders", format: (row) => (row.linked ? row.ordersCount : "—") },
                {
                  key: "totalSpend",
                  header: "Total spent",
                  format: (row) => (row.totalSpend === null ? "—" : formatCurrency(row.totalSpend)),
                },
                {
                  key: "lastOrderAt",
                  header: "Last order",
                  format: (row) => (row.lastOrderAt ? row.lastOrderAt.slice(0, 10) : "—"),
                },
                { key: "joinedAt", header: "Joined" },
              ]}
              sort={sortState}
              sortableKeys={[
                "name",
                "city",
                "ordersCount",
                "totalSpend",
                "lastOrderAt",
              ]}
              onSortChange={(next) =>
                update({
                  sort: next.key as typeof params.sort,
                  dir: next.dir as SortDir,
                })
              }
              page={params.page}
              onPageChange={(page) => update({ page })}
            />
          </Card>
        </TableBoundary>
      </Section>
    </PageContainer>
  );
}

/**
 * The note that used to sit here claimed Orders/Total spent/Tier were seed
 * constants and that a customer could not be linked to their orders by id. Both
 * stopped being true at 0012 and 0059, so it is gone rather than reworded.
 *
 * What replaces it is narrower and still true: a row with no auth account has no
 * orders of its own, and saying "—" is the honest cell. Migration 0061 excludes
 * walk-in orders (no customer_user_id) from every per-customer aggregate and
 * reports them as the walk-in total above, so they cannot inflate a spend here.
 */
function CustomerStatsNote() {
  return (
    <p
      className="border-b border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground"
      role="note"
    >
      Orders, total spent and tier are computed from each customer&apos;s own
      delivered orders. Rows without a linked account (seed fixtures) show “—”,
      and orders placed without an account are counted separately as walk-ins.
    </p>
  );
}