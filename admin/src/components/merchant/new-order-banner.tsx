"use client";

import { useEffect } from "react";
import type { NewOrderAlert } from "@/lib/use-order-realtime";
import { formatCurrency } from "@/lib/format";

/**
 * New-order alert for the merchant portal.
 *
 * Hand-rolled to match components/ui, which is entirely local, rather than
 * pulling in a toast library for one banner. The project carries eight
 * dependencies and adding a ninth for a fixed card is not a trade worth
 * making.
 *
 * Announced through role="status" + aria-live so a merchant using a screen
 * reader hears the order instead of watching a box appear.
 */
export function NewOrderBanner({
  alert,
  onDismiss,
  durationMs = 10000,
}: {
  alert: NewOrderAlert | null;
  onDismiss: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [alert, onDismiss, durationMs]);

  if (!alert) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-50 sm:inset-x-auto sm:right-6 sm:w-96"
    >
      <div className="rounded-lg border border-primary/30 bg-card p-4 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              New order
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-card-foreground">
              {alert.reference} · {alert.customer}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(alert.total)} — waiting on you
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss new order alert"
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
