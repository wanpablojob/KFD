"use client";

import Link from "next/link";
import type { Column } from "@/components/ui/data-table";
import { formatCurrency } from "@/lib/format";
import type { RiderPayout } from "@/lib/rider-ledger";

/**
 * What this rider earned, per delivery.
 *
 * The ledger's own rows, not orders.total. The delivery history table further
 * down still shows total because there it means "what the customer paid", which
 * is a legitimate column of an order; here the column is money the rider
 * earned and the two were never the same number.
 */
/**
 * What this rider earned, per delivery.
 *
 * The ledger's own rows, not orders.total. The delivery history table further
 * down still shows total because there it means "what the customer paid", which
 * is a legitimate column of an order; here the column is money the rider earned
 * and the two were never the same number.
 */
export const payoutColumns: Column<RiderPayout>[] = [
  {
    key: "earnedAt",
    header: "Earned",
    cell: (row) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {new Date(row.earnedAt).toLocaleString()}
      </span>
    ),
  },
  {
    key: "restaurant",
    header: "Restaurant",
    cell: (row) => (
      <span className="font-medium text-card-foreground">{row.restaurant}</span>
    ),
  },
  {
    key: "reference",
    header: "Order",
    cell: (row) => (
      <Link
        href={`/dashboard/orders?order=${row.reference}`}
        className="text-card-foreground underline underline-offset-2"
      >
        {row.reference}
      </Link>
    ),
  },
  {
    key: "amount",
    header: "Earned",
    align: "right",
    cell: (row) => (
      <span className="font-medium text-card-foreground">
        {formatCurrency(row.amount)}
      </span>
    ),
  },
];
