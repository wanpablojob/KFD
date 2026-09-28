"use client";

import { useMemo, useState } from "react";
import { fetchMerchantOrders } from "@/lib/supabase/merchant-queries";
import type { OrderStatus } from "@/lib/types";
import { useAsyncData } from "@/lib/use-async-data";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchIcon } from "@/components/ui/icons";
import { EmptyState, LoadingState } from "@/components/ui/status";
import { StatusBadge } from "@/components/ui/status-badge";
import { OrderActions } from "@/components/merchant/order-actions";
import { NewOrderBanner } from "@/components/merchant/new-order-banner";
import { useOrderRealtime } from "@/lib/use-order-realtime";
import { useUserRole } from "@/lib/use-user-role";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

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

  const { newOrder, dismissNewOrder } = useOrderRealtime(isMerchant, orders.refetch);

  const rows = useMemo(() => {
    const all = orders.data ?? [];
    const q = query.trim().toLowerCase();
    return all.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (!q) return true;
      return (
        o.reference.toLowerCase().includes(q) ||
        o.customer.toLowerCase().includes(q)
      );
    });
  }, [orders.data, status, query]);

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

      {orders.loading ? (
        <LoadingState label="Loading orders…" />
      ) : rows.length === 0 ? (
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

      <NewOrderBanner alert={newOrder} onDismiss={dismissNewOrder} />
    </PageContainer>
  );
}
