"use client";

import { useCallback, useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase/client";

export type OrderEvent = "INSERT" | "UPDATE";

export interface NewOrderAlert {
  id: string;
  reference: string;
  customer: string;
  total: number;
}

interface OrderRow {
  id: string;
  reference: string;
  customer: string;
  total: number | string;
}

export interface OrderRealtime {
  /** The most recent insert, or null once dismissed. */
  newOrder: NewOrderAlert | null;
  dismissNewOrder: () => void;
}

/**
 * Live order updates for the merchant portal.
 *
 * Realtime is used as a *trigger to refetch*, not as a source of state: the
 * payload is discarded and the list is read again. Merging realtime rows into
 * React state buys nothing at this scale and opens a whole category of
 * stale-state and out-of-order bugs, so it is deliberately avoided.
 *
 * Scoping is not this hook's job. RLS runs per subscriber, so the
 * 'scoped access: orders' policy decides which rows ever arrive. The channel
 * is opened on the authenticated browser client, so that policy applies;
 * using the service role here would silently broadcast every restaurant's
 * orders to every subscriber.
 *
 * `enabled` should be `isMerchant` from useUserRole. That flag is false while
 * the role is still resolving, which is what prevents the channel from
 * opening before the session is known and quietly missing rows.
 */
export function useOrderRealtime(
  enabled: boolean,
  onChange: () => void
): OrderRealtime {
  const [newOrder, setNewOrder] = useState<NewOrderAlert | null>(null);

  const dismissNewOrder = useCallback(() => setNewOrder(null), []);

  useEffect(() => {
    if (!enabled) return;

    const handle = (event: OrderEvent, row: OrderRow | null) => {
      onChange();

      // Only an insert is news. An update is usually the merchant's own
      // status change coming back around, and announcing those as "new order"
      // would be noise rather than information.
      if (event !== "INSERT" || !row) return;

      setNewOrder({
        id: row.id,
        reference: row.reference,
        customer: row.customer,
        // numeric has crossed the wire as a string as well as a number.
        total: Number(row.total),
      });
    };

    const channel: RealtimeChannel = supabase
      .channel("merchant-orders")
      // INSERT and UPDATE only, deliberately not '*'. Postgres cannot verify
      // that a subscriber is entitled to a row it is deleting, so Supabase
      // does not apply RLS to DELETE events and broadcasts them to every
      // subscriber. The portal never removes orders, so there is nothing to
      // gain from listening and cross-tenant delete metadata to leak.
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) =>
          handle(
            "INSERT",
            (payload.new as OrderRow | undefined) ?? null
          )
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        () => handle("UPDATE", null)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, onChange]);

  return { newOrder, dismissNewOrder };
}
