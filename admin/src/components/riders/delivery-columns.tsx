"use client";

import type { Column } from "@/components/ui/data-table";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency } from "@/lib/format";
import type { RiderDelivery } from "@/lib/rider-orders";

export const deliveryColumns: Column<RiderDelivery>[] = [
  {
    key: "reference",
    header: "Reference",
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
    cell: (row) => <span className="font-medium text-card-foreground">{formatCurrency(row.total)}</span>,
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
      <Badge variant="secondary" size="sm">{row.payment.replace(/_/g, " ")}</Badge>
    ),
  },
  {
    key: "placedAt",
    header: "Placed",
    cell: (row) => <span className="whitespace-nowrap text-muted-foreground">{row.placedAt}</span>,
  },
];
