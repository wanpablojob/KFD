"use client";

import { useState } from "react";
import type { Column } from "@/components/ui/data-table";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency } from "@/lib/format";
import { deliveryProofUrl } from "@/lib/supabase/queries";
import type { RiderDelivery } from "@/lib/rider-orders";

/**
 * A delivery proof lives in a private bucket, so the row cannot hold a URL.
 * Clicking mints a short-lived signed URL; the storage policy in 0079 lets an
 * admin read any rider's proof because settling a cash dispute is its purpose.
 */
function ProofLink({ path }: { path: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!path) {
    return <span className="text-muted-foreground">No photo</span>;
  }

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const url = await deliveryProofUrl(path as string);
      if (!url) throw new Error("Could not create a link to that photo.");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not open that photo.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        className="w-fit text-sm text-primary underline-offset-2 hover:underline disabled:opacity-60"
      >
        {busy ? "Opening…" : "View photo"}
      </button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}

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
  {
    // 0079. Required for every delivery completed after it, so "No photo" here
    // means the delivery predates the rule rather than that proof was skipped.
    key: "proof",
    header: "Proof",
    cell: (row) => <ProofLink path={row.deliveryPhotoPath} />,
  },
];
