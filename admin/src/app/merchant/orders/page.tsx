"use client";

import { useMemo, useState } from "react";
import { fetchMerchantOrders } from "@/lib/supabase/merchant-queries";
import type { OrderStatus, DateRange } from "@/lib/types";
import { useAsyncData } from "@/lib/use-async-data";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchIcon, CalendarIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/status";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableBoundary } from "@/components/ui/table-boundary";
import { OrderActions } from "@/components/merchant/order-actions";
import { NewOrderBanner } from "@/components/merchant/new-order-banner";
import { useOrderNotifications } from "@/lib/use-order-notifications";
import { useUserRole } from "@/lib/use-user-role";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type DatePreset = "today" | "yesterday" | "week" | "month" | "all" | "custom";

const FILTERS: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "preparing", label: "Preparing" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Rejected" },
];

export default function MerchantOrdersPage() {
  const { isMerchant } = useUserRole();
  const orders = useAsyncData(() => fetchMerchantOrders());
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [dateRange, setDateRange] = useState<DateRange>({});

  const { newOrder, dismissNewOrder } = useOrderNotifications(
    isMerchant,
    orders.refetch
  );

  const resolvedRange = useMemo((): DateRange | null => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    const startOfWeek = new Date(startOfToday.getTime() - now.getDay() * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const toISO = (d: Date) => d.toISOString().split("T")[0];

    switch (datePreset) {
      case "today":
        return { from: toISO(startOfToday), to: toISO(now) };
      case "yesterday":
        return { from: toISO(startOfYesterday), to: toISO(startOfYesterday) };
      case "week":
        return { from: toISO(startOfWeek), to: toISO(now) };
      case "month":
        return { from: toISO(startOfMonth), to: toISO(now) };
      case "custom":
        return dateRange.from || dateRange.to ? dateRange : null;
      default:
        return null;
    }
  }, [datePreset, dateRange]);

  const rows = useMemo(() => {
    const all = orders.data ?? [];
    const q = query.trim().toLowerCase();
    return all.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (resolvedRange) {
        if (resolvedRange.from && o.placedAt < resolvedRange.from) return false;
        if (resolvedRange.to && o.placedAt > resolvedRange.to + "T23:59:59.999Z") return false;
      }
      if (!q) return true;
      return (
        o.reference.toLowerCase().includes(q) ||
        o.customer.toLowerCase().includes(q)
      );
    });
  }, [orders.data, status, query, resolvedRange]);

  return (
    <PageContainer>
      <PageHeader
        title="Orders"
        description="Accept or reject new orders, and keep the kitchen in sync."
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <SearchIcon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reference or customer"
            aria-label="Search orders"
            className="pl-9"
          />
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-2" aria-label="Date range">
          <div className="flex gap-1" role="group" aria-label="Quick date filters">
            {(["today", "yesterday", "week", "month", "all"] as DatePreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setDatePreset(preset);
                  if (preset !== "custom") setDateRange({});
                }}
                aria-pressed={datePreset === preset}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  datePreset === preset
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {preset.charAt(0).toUpperCase() + preset.slice(1)}
              </button>
            ))}
          </div>
          {datePreset === "custom" && (
            <div className="flex items-center gap-1">
              <label htmlFor="merch-date-from" className="sr-only">From</label>
              <input
                id="merch-date-from"
                type="date"
                value={dateRange.from ?? ""}
                onChange={(e) => setDateRange((d) => ({ ...d, from: e.target.value || undefined }))}
                className="h-9 px-3 text-sm border border-input bg-background rounded-md"
              />
              <label htmlFor="merch-date-to" className="sr-only">To</label>
              <input
                id="merch-date-to"
                type="date"
                value={dateRange.to ?? ""}
                onChange={(e) => setDateRange((d) => ({ ...d, to: e.target.value || undefined }))}
                className="h-9 px-3 text-sm border border-input bg-background rounded-md"
              />
              {(dateRange.from || dateRange.to) && (
                <button
                  type="button"
                  onClick={() => setDateRange({})}
                  className="p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Clear date filter"
                >
                  <CalendarIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div
        className="mb-5 flex flex-wrap gap-1.5"
        role="group"
        aria-label="Filter orders by status"
      >
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatus(f.value)}
            aria-pressed={status === f.value}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              status === f.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* TableBoundary owns loading and error. An earlier `if (loading)` early
          return meant a failed fetch looked identical to "no orders yet", so a
          merchant during an outage would believe they were safe. */}
      <TableBoundary
        loading={orders.loading}
        error={orders.error}
        onRetry={orders.refetch}
        errorTitle="Could not load your orders"
        skeletonRows={5}
        skeletonColumns={3}
      >
        {rows.length === 0 ? (
          <EmptyState
            title="No matching orders"
            description={
              query || status !== "all"
                ? "Try a different filter or search term."
                : "Orders will show up here once customers start ordering."
            }
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((order) => (
              <li key={order.id}>
                <Card>
                  <div className="px-5 pb-5">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-card-foreground">
                            {order.reference}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {order.customer} · {formatDateTime(order.placedAt)} ·{" "}
                            {order.payment.replace("_", " ")}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-sm font-semibold">
                            {formatCurrency(order.total)}
                          </span>
                          <StatusBadge status={order.status} />
                        </div>
                      </div>

                      <ul className="space-y-1 rounded-lg bg-muted/50 px-3 py-2">
                        {order.items.map((item, i) => (
                          <li
                            key={`${order.id}-${i}`}
                            className="flex items-center justify-between text-xs"
                          >
                            <span>
                              {item.quantity}× {item.name}
                            </span>
                            <span className="text-muted-foreground">
                              {formatCurrency(item.price * item.quantity)}
                            </span>
                          </li>
                        ))}
                      </ul>

                      <OrderActions
                        orderId={order.id}
                        status={order.status}
                        onChanged={orders.refetch}
                      />
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </TableBoundary>

      <NewOrderBanner alert={newOrder} onDismiss={dismissNewOrder} />
    </PageContainer>
  );
}
