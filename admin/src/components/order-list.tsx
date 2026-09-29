"use client";

import { useState, useMemo } from "react";
import type { Order, DateRange } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { Avatar } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { DataTable, type Column } from "./ui/data-table";
import { Pagination } from "./ui/pagination";
import { StatusBadge } from "./ui/status-badge";
import { Dialog } from "./ui/dialog";
import { OrderDetail } from "./order-detail";
import { Toolbar, ToolbarSpacer, ToolbarSearch } from "./toolbar";
import { Select } from "./ui/select";
import { CalendarIcon } from "./ui/icons";
import { matchesQuery, useGlobalSearch } from "@/lib/global-search";

type OrderStatus = Order["status"];

const PAGE_SIZE = 10;

const columns: Column<Order>[] = [
  {
    key: "reference",
    header: "Ref",
    cell: (row) => <span className="font-medium text-card-foreground">{row.reference}</span>,
  },
  {
    key: "customer",
    header: "Customer",
    cell: (row) => (
      <span className="flex items-center gap-2.5">
        <Avatar name={row.customer} size="sm" />
        <span className="text-card-foreground">{row.customer}</span>
      </span>
    ),
  },
  {
    key: "restaurant",
    header: "Restaurant",
    cell: (row) => row.restaurant,
  },
  {
    key: "total",
    header: "Total",
    align: "right",
    cell: (row) => (
      <span className="font-medium text-card-foreground">
        {formatCurrency(row.total)}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: "payment",
    header: "Payment",
    cell: (row) => (
      <Badge variant="secondary" size="sm">
        {row.payment.replace(/_/g, " ")}
      </Badge>
    ),
  },
  {
    key: "placedAt",
    header: "Placed",
    cell: (row) => (
      <span className="whitespace-nowrap text-muted-foreground">{row.placedAt}</span>
    ),
  },
  {
    key: "rider",
    header: "Rider",
    cell: (row) =>
      row.rider === "Unassigned" ? (
        <Badge variant="warning" size="sm">Unassigned</Badge>
      ) : (
        <span className="text-card-foreground">{row.rider}</span>
      ),
  },
];

const ALL_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

export function OrderList({ orders }: { orders: Order[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Order | null>(null);
  const globalQuery = useGlobalSearch();

  const filtered = useMemo(() => {
    return orders.filter((order) => {
      const matchesStatus = status === "all" || order.status === status;
      const matchesDate =
        (!dateRange.from || order.placedAt >= dateRange.from) &&
        (!dateRange.to || order.placedAt <= dateRange.to + "T23:59:59.999Z");
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        order.reference.toLowerCase().includes(q) ||
        order.customer.toLowerCase().includes(q) ||
        order.restaurant.toLowerCase().includes(q) ||
        order.rider.toLowerCase().includes(q);
      const matchesGlobal = matchesQuery(
        order as unknown as Record<string, unknown>,
        globalQuery,
        ["reference", "customer", "restaurant", "rider"],
      );
      return matchesStatus && matchesDate && matchesSearch && matchesGlobal;
    });
  }, [orders, search, status, dateRange, globalQuery]);

  const pageRows = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  return (
    <div className="space-y-4">
      <Toolbar>
        <ToolbarSearch
          value={search}
          onChange={setSearch}
          placeholder="Search by ref, customer, restaurant…"
          ariaLabel="Search orders"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as OrderStatus | "all")}
          className="w-full sm:w-48"
        >
          <option value="all">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-2 hidden sm:flex" aria-label="Date range">
          <label htmlFor="date-from" className="sr-only">From</label>
          <input
            id="date-from"
            type="date"
            value={dateRange.from ?? ""}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateRange((d) => ({ ...d, from: e.target.value || undefined }))}
            className="h-9 px-3 text-sm border border-input bg-background rounded-md"
          />
          <label htmlFor="date-to" className="sr-only">To</label>
          <input
            id="date-to"
            type="date"
            value={dateRange.to ?? ""}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateRange((d) => ({ ...d, to: e.target.value || undefined }))}
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
        <ToolbarSpacer />
        <span className="text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "order" : "orders"}
        </span>
      </Toolbar>

      <div className="rounded-(--radius-card) border border-border bg-card shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          rows={pageRows}
          onRowClick={setSelected}
        />
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={filtered.length}
          onPageChange={setPage}
        />
      </div>

      <Dialog
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `Order ${selected.reference}` : "Order"}
      >
        {selected ? <OrderDetail order={selected} /> : null}
      </Dialog>
    </div>
  );
}