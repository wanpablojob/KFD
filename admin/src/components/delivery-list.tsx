"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { DataTable, type Column } from "./ui/data-table";
import { StatusBadge } from "./ui/status-badge";
import { dispatchDelivery } from "@/lib/supabase/dispatch-queries";
import type { AdminDelivery } from "@/lib/supabase/delivery-queries";

/**
 * The trips: one basket from several shops, one delivery.
 *
 * A dispatcher reads this to answer three questions that the orders list
 * cannot: which shops are in this basket, who is carrying it, and what was
 * collected in cash. The cash and the rider's fee live on the trip, so the
 * trip is the row that has them.
 */

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting for the shops",
  confirmed: "All shops accepted",
  preparing: "Being prepared",
  out_for_delivery: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const columns: Column<AdminDelivery>[] = [
  {
    key: "reference",
    header: "Ref",
    cell: (row) => (
      <Link
        href={`/dashboard/deliveries/${row.id}`}
        className="font-medium text-card-foreground underline-offset-2 hover:underline"
      >
        {row.reference}
      </Link>
    ),
  },
  {
    key: "customer",
    header: "Customer",
    cell: (row) => row.customer,
  },
  {
    key: "shops",
    header: "Shops",
    cell: (row) => (
      <span className="text-muted-foreground">
        {row.restaurantNames.length > 0
          ? row.restaurantNames.join(", ")
          : `${row.shops} restaurant${row.shops === 1 ? "" : "s"}`}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => (
      <span className="flex flex-wrap items-center gap-2">
        <StatusBadge status={row.status as never} />
        <span className="text-xs text-muted-foreground">
          {STATUS_LABEL[row.status] ?? row.status}
        </span>
      </span>
    ),
  },
  {
    key: "rider",
    header: "Rider",
    cell: (row) =>
      row.rider ? (
        row.rider
      ) : (
        <Badge variant="outline" size="sm">
          Unassigned
        </Badge>
      ),
  },
  {
    key: "total",
    header: "Total",
    cell: (row) => formatCurrency(row.total),
  },
  {
    key: "placedAt",
    header: "Placed",
    cell: (row) => (
      <span className="text-muted-foreground">
        {new Date(row.placedAt).toLocaleString()}
      </span>
    ),
  },
];

export function DeliveryList({ deliveries }: { deliveries: AdminDelivery[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  // Only the trips nobody has taken can be re-offered: a trip with a rider is
  // already on its way, and one that is delivered is done.
  const waiting = useMemo(
    () =>
      deliveries.filter(
        (d) =>
          !d.rider &&
          (d.status === "confirmed" || d.status === "preparing"),
      ),
    [deliveries],
  );

  async function reoffer(deliveryId: string) {
    setBusy(deliveryId);
    try {
      const offered = await dispatchDelivery(deliveryId);
      setNotes((n) => ({
        ...n,
        [deliveryId]:
          offered === 0
            ? "No rider is online in this city right now."
            : `Offered to ${offered} ${offered === 1 ? "rider" : "riders"}.`,
      }));
    } catch (cause) {
      setNotes((n) => ({
        ...n,
        [deliveryId]:
          cause instanceof Error
            ? cause.message
            : "Could not re-offer this trip.",
      }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {waiting.length > 0 ? (
        <div className="rounded-(--radius-card) border border-border bg-card px-4 py-3">
          <p className="text-sm font-medium text-card-foreground">
            {waiting.length} trip{waiting.length === 1 ? "" : "s"} waiting for a
            rider
          </p>
          <ul className="mt-2 space-y-1">
            {waiting.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="text-muted-foreground">
                  {d.reference} · {d.customer} ·{" "}
                  {d.restaurantNames.join(", ") || `${d.shops} restaurants`}
                </span>
                <span className="flex items-center gap-2">
                  {notes[d.id] ? (
                    <span className="text-xs text-muted-foreground">
                      {notes[d.id]}
                    </span>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    loading={busy === d.id}
                    disabled={busy !== null}
                    onClick={() => void reoffer(d.id)}
                  >
                    Re-offer
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <DataTable columns={columns} rows={deliveries} />
    </div>
  );
}
