"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BellIcon } from "./ui/icons";
import { StatusBadge } from "./ui/status-badge";
import { formatShortDate } from "@/lib/format";
import { useOrderNotifications } from "@/lib/use-order-notifications";
import type { Order } from "@/lib/types";

const LIVE_STATUSES: Order["status"][] = [
  "confirmed",
  "preparing",
  "out_for_delivery",
];

/**
 * The admin's order notifications.
 *
 * This used to filter the orders array down to whatever was in flight and call
 * the result "notifications", with unreadness in a `useState` that reset on
 * every reload. Unread is now persisted per account (see migration 0015) and the
 * list is refreshed from a realtime event rather than recomputed on render, so
 * the two surfaces in this app no longer maintain separate mechanisms.
 *
 * There is no notifications table. An order is unread for an operator when it
 * was placed after that operator's high-water mark, which is derivable from
 * orders.placed_at -- so the table would be a second source of truth for a fact
 * that is already in the data.
 *
 * The channel and its RLS branch live in useOrderNotifications, shared with the
 * merchant banner.
 */
export function NotificationBell({
  orders,
  onOrdersChange,
  enabled,
}: {
  orders: Order[];
  onOrdersChange: () => void;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { isUnread, markAllRead, readStateLoaded } = useOrderNotifications(
    enabled,
    onOrdersChange
  );

  const updates = orders.filter((o) => LIVE_STATUSES.includes(o.status)).slice(0, 6);
  const unreadCount = updates.filter((o) => isUnread(o.placedAt)).length;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Opening the dropdown is the acknowledgement gesture. Tying it to the read
  // state -- rather than to a click that also toggles the panel -- is what stops
  // the dot from reappearing on the next page load.
  function toggle() {
    setOpen((v) => !v);
    if (!open && unreadCount > 0) markAllRead();
  }

  const label =
    unreadCount > 0
      ? `Notifications, ${unreadCount} unread`
      : readStateLoaded
        ? "Notifications, all read"
        : "Notifications";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            data-bell-unread
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary"
          />
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          data-bell-panel
          className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-(--radius-card) border border-border bg-card shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold text-card-foreground">
              Status updates
            </p>
            <span className="text-xs text-muted-foreground">Live</span>
          </div>
          {updates.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nothing in progress right now.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-border/70 overflow-y-auto">
              {updates.map((o) => {
                const unread = isUnread(o.placedAt);
                return (
                  <li key={o.id}>
                    {/*
                      A link, so the item can actually be acted on. The old
                      rows were non-focusable <li>s, which meant a keyboard
                      user could open the bell and then reach nothing inside it.
                      The ?q= lands on the orders list already filtered, reusing
                      the same seed the global search does.
                    */}
                    <Link
                      href={`/orders?q=${encodeURIComponent(o.reference)}`}
                      onClick={() => setOpen(false)}
                      data-bell-item={o.reference}
                      data-unread={unread ? "true" : "false"}
                      className="block px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-card-foreground">
                          {o.reference}
                        </span>
                        <StatusBadge status={o.status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {o.customer} · {o.restaurant}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {unread ? (
                          <span
                            aria-hidden="true"
                            className="inline-block h-1.5 w-1.5 rounded-full bg-primary"
                          />
                        ) : null}
                        {formatShortDate(o.placedAt)}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
