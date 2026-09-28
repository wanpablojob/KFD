"use client";

import { useCallback, useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase/client";
import { useAsyncData } from "./use-async-data";
import { isUnreadSince } from "./notification-cursor";
import { fetchNotificationCursor, markNotificationsSeen } from "./notifications";

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

export interface OrderNotifications {
  /** The most recent insert, or null once dismissed. */
  newOrder: NewOrderAlert | null;
  dismissNewOrder: () => void;
  /** The persisted high-water mark, or null if never acknowledged. */
  lastSeenAt: string | null;
  /** Whether an order placed at this instant is unread for this operator. */
  isUnread: (placedAt: string) => boolean;
  markAllRead: () => void;
  readStateLoaded: boolean;
}

/**
 * One subscription for every order notification in the app.
 *
 * This replaces two mechanisms that did not know about each other: an admin
 * bell that derived "updates" from a filtered view of the orders array and kept
 * unreadness in a component-local useState, and a merchant realtime banner with
 * its own channel. The duplication was not the subscription itself but the fact
 * that two components each owned one, with the RLS branch they depended on
 * living in a comment rather than in the code.
 *
 * The two surfaces are still different views, deliberately. The merchant gets a
 * transient, attention-grabbing banner for a single insert -- the thing they
 * must act on within seconds. The admin gets a persistent, countable list. One
 * channel, two presentations, because collapsing them would mean making the
 * merchant wait for a dropdown or making the admin dismiss a modal.
 *
 * Realtime is a trigger to refetch, not a source of state. `onChange()` runs and
 * the caller re-reads from Postgres; the only payload used is the one-shot
 * insert alert, which is a notification about an event rather than a cache of
 * rows. Merging event payloads into a list would reintroduce out-of-order and
 * stale-state bugs that this deliberately avoids.
 *
 * RLS applies per subscriber, so `enabled` is the whole of the scoping story:
 * pass isAdmin for the admin console and isMerchant for the merchant portal, and
 * the 'scoped access: orders' policy decides which rows ever arrive. Both flags
 * are false while the role is still resolving, which is what stops the channel
 * opening before the session is known and quietly missing rows. The service role
 * is never used here -- on the client it would broadcast every restaurant's
 * orders to every subscriber.
 */
export function useOrderNotifications(
  enabled: boolean,
  onChange: () => void
): OrderNotifications {
  const [newOrder, setNewOrder] = useState<NewOrderAlert | null>(null);
  // Set only by markAllRead, to clear the badge before the write lands. The
  // fetched cursor is the source of truth otherwise, so there is no effect
  // mirroring one into the other -- two copies of the same value is two things
  // that can disagree.
  const [optimisticCursor, setOptimisticCursor] = useState<string | null>(null);

  // useAsyncData rather than a bare effect: the read is a fetch with its own
  // loading state, and this already handles the role resolving after first
  // render. The key is the flag, so the fetch waits for the session to be known
  // rather than asking as anon and caching the wrong answer.
  const { data: fetchedCursor, loading: cursorLoading } = useAsyncData(
    fetchNotificationCursor,
    enabled ? "on" : "off"
  );

  const lastSeenAt = optimisticCursor ?? fetchedCursor ?? null;

  const dismissNewOrder = useCallback(() => setNewOrder(null), []);

  const markAllRead = useCallback(() => {
    // Optimistic: the bell is a badge, and waiting for a round trip to clear a
    // dot the operator just clicked reads as a dropped click. The next page
    // load refetches the real value, so a failed write self-corrects.
    setOptimisticCursor(new Date().toISOString());
    void markNotificationsSeen().catch(() => {});
  }, []);

  const isUnread = useCallback(
    (placedAt: string) => isUnreadSince(placedAt, lastSeenAt),
    [lastSeenAt]
  );

  useEffect(() => {
    if (!enabled) return;

    const handle = (event: OrderEvent, row: OrderRow | null) => {
      onChange();

      // Only an insert is news. An update is usually the merchant's own status
      // change coming back around, and announcing those as "new order" would be
      // noise rather than information.
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
      .channel("order-notifications")
      // INSERT and UPDATE only, deliberately not '*'. Postgres cannot verify
      // that a subscriber is entitled to a row it is deleting, so Supabase does
      // not apply RLS to DELETE events and broadcasts them to every subscriber.
      // The portal never removes orders, so there is nothing to gain from
      // listening and cross-tenant delete metadata to leak.
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => handle("INSERT", (payload.new as OrderRow | undefined) ?? null)
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

  return {
    newOrder,
    dismissNewOrder,
    lastSeenAt,
    isUnread,
    markAllRead,
    // False while the cursor is still in flight, so the bell can render a
    // stable label instead of flashing "0 unread" and then correcting itself.
    readStateLoaded: enabled && !cursorLoading,
  };
}
