"use client";

import { useAsyncData } from "@/lib/use-async-data";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { fetchOrderRefunds } from "@/lib/supabase/feedback-queries";

/**
 * Refunds recorded against an order (0078). Read-only: money goes back only by
 * approving the customer's refund request in the Overview's Needs attention
 * card (0159, 0161), so there is no form to record one here.
 */
export function OrderRefunds({ orderId, total }: { orderId: string; total: number }) {
  const refunds = useAsyncData(() => fetchOrderRefunds(orderId), orderId);
  const rows = refunds.data ?? [];
  if (rows.length === 0) return null;
  const refunded = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-card-foreground">
        Refunds · {formatCurrency(refunded)} of {formatCurrency(total)}
      </p>
      <ul className="space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex justify-between gap-3">
            <span className="text-card-foreground">
              {formatCurrency(r.amount)} by {r.method === "gcash" ? "GCash" : "cash"}: {r.reason}
            </span>
            <span className="shrink-0 text-muted-foreground">{formatDateTime(r.created_at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
