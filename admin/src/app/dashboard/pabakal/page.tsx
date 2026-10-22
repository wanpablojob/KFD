"use client";

import { useState } from "react";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableBoundary } from "@/components/ui/table-boundary";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { useAsyncData } from "@/lib/use-async-data";
import { cancelPabakal, fetchPabakal, type Pabakal } from "@/lib/supabase/pabakal-queries";

const STATUS_LABEL: Record<Pabakal["status"], string> = {
  open: "Waiting for a rider",
  accepted: "Rider buying",
  delivering: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** Pabakal requests (0120), newest first, with a way out for a stuck one. */
export default function PabakalPage() {
  const rows = useAsyncData(() => fetchPabakal());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cancel(p: Pabakal) {
    const reason = window.prompt(`Why cancel ${p.reference}? The customer sees this.`);
    if (!reason?.trim()) return;
    setBusy(p.id);
    setError(null);
    try {
      await cancelPabakal(p.id, reason);
      rows.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not cancel.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Pabakal"
        description="Buy-for-me requests from one or more stores. The rider fronts the cash (up to ₱2,000) and collects receipt + fees at the door."
      />
      <Section>
        {error ? (
          <p className="mb-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <TableBoundary
          loading={rows.loading}
          error={rows.error}
          onRetry={rows.refetch}
          errorTitle="Could not load pabakal"
          skeletonRows={4}
          skeletonColumns={3}
        >
          {(rows.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No pabakal yet.</p>
          ) : (
            <Card>
              <ul className="divide-y divide-border">
                {(rows.data ?? []).map((p) => (
                  <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-card-foreground">
                        {p.reference} · {p.store}
                        <Badge variant="secondary" size="sm">
                          {STATUS_LABEL[p.status]}
                        </Badge>
                      </p>
                      <p className="whitespace-pre-line text-muted-foreground">{p.items}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.customer_name} · {p.contact_phone} · {p.delivery_address}
                        {p.barangay ? `, ${p.barangay}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Fees {formatCurrency(p.delivery_fee + p.pabakal_fee)}
                        {p.item_cost !== null ? ` · receipt ${formatCurrency(p.item_cost)}` : ""}
                        {p.cash_collected !== null ? ` · collected ${formatCurrency(p.cash_collected)}` : ""}
                        {p.rider_id ? ` · rider ${p.rider_id}` : ""}
                      </p>
                      {p.cancel_reason ? (
                        <p className="text-xs text-muted-foreground">{p.cancel_reason}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatDateTime(p.created_at)}</span>
                      {p.status === "open" || p.status === "accepted" || p.status === "delivering" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          loading={busy === p.id}
                          disabled={busy !== null}
                          onClick={() => void cancel(p)}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </TableBoundary>
      </Section>
    </PageContainer>
  );
}
