"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { fetchTrackedOrder, isTerminal, type TrackedOrder } from "@/lib/tracking";

/**
 * The tracking view itself, kept separate from the route so the page stays a
 * thin server component and the reference is read once.
 */
export function OrderTracker({ reference }: { reference: string }) {
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">(
    "loading"
  );
  // Held in a ref as well as state: the poller must not tear down and rebuild
  // its interval every time a poll resolves, or a slow response would starve
  // the next one.
  const terminal = useRef(false);

  const load = useCallback(async () => {
    try {
      const next = await fetchTrackedOrder(reference);
      if (next) {
        setOrder(next);
        setState("ready");
        if (isTerminal(next.status)) terminal.current = true;
      } else {
        setState("missing");
        // Nothing to poll for. A not-found is not going to become found by
        // asking again, and this page is the least authenticated surface in
        // the app, so it should not keep hitting the database on a timer.
        terminal.current = true;
      }
    } catch {
      setState("error");
    }
  }, [reference]);

  useEffect(() => {
    // Deferred through a timer for the same reason global-search defers its
    // first query: react-hooks/set-state-in-effect rejects a state write
    // issued from the effect body, and batching the first fetch past this
    // commit also means the loading state actually paints.
    const first = setTimeout(() => void load(), 0);

    const timer = setInterval(() => {
      if (!terminal.current) void load();
    }, 15000);

    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  if (state === "loading") {
    return (
      <p className="text-sm text-muted-foreground" data-tracking-state="loading">
        Looking up {reference}…
      </p>
    );
  }

  if (state === "error") {
    return (
      <div data-tracking-state="error" className="space-y-2">
        <p className="text-sm font-medium text-card-foreground">
          We could not reach the order service.
        </p>
        <p className="text-sm text-muted-foreground">
          Check your connection and reload the page.
        </p>
      </div>
    );
  }

  if (state === "missing" || !order) {
    // Deliberately identical for "no such order" and "not trackable without an
    // account". Saying which one it was would confirm that a guessed reference
    // is real.
    return (
      <div data-tracking-state="missing" className="space-y-2">
        <p className="text-sm font-medium text-card-foreground">
          We could not find that order.
        </p>
        <p className="text-sm text-muted-foreground">
          Check the reference on your receipt. It looks like{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            #KFD-XXXXXXXXXXXX
          </code>
          .
        </p>
      </div>
    );
  }

  return (
    <div data-tracking-state="ready" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-sm text-muted-foreground">
            {order.reference}
          </p>
          <p className="text-lg font-semibold text-card-foreground">
            {order.restaurant}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <p className="text-sm text-muted-foreground">
        Placed {formatDateTime(order.placedAt)}
        {isTerminal(order.status)
          ? ""
          : " · this page refreshes itself while the order is on its way"}
      </p>

      <ul className="divide-y divide-border/70 rounded-(--radius-card) border border-border">
        {order.items.map((item, i) => (
          <li
            key={`${item.name}-${i}`}
            className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
          >
            <span className="text-card-foreground">
              {item.quantity} × {item.name}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {formatCurrency(item.quantity * item.price)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="tabular-nums text-card-foreground">
            {formatCurrency(order.subtotal)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Delivery</dt>
          <dd className="tabular-nums text-card-foreground">
            {formatCurrency(order.deliveryFee)}
          </dd>
        </div>
        <div className="flex justify-between border-t border-border pt-1.5 font-medium">
          <dt className="text-card-foreground">Total</dt>
          <dd className="tabular-nums text-card-foreground" data-tracking-total>
            {formatCurrency(order.total)}
          </dd>
        </div>
      </dl>

      {/*
        Announced so a screen-reader user learns the status changed without
        having to go looking for the badge. Polite, because it interrupts
        nothing: the user is waiting on a delivery, not typing.
      */}
      <p aria-live="polite" className="sr-only" data-tracking-live>
        Order {order.reference} is {order.status.replace(/_/g, " ")}.
      </p>
    </div>
  );
}
