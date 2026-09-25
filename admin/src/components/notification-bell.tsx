"use client";

import { useEffect, useRef, useState } from "react";
import { BellIcon } from "./ui/icons";
import { StatusBadge } from "./ui/status-badge";
import { formatShortDate } from "@/lib/format";
import type { Order } from "@/lib/types";

const LIVE_STATUSES: Order["status"][] = [
  "confirmed",
  "preparing",
  "out_for_delivery",
];

/**
 * Recent status-update feed derived from the orders table: the newest orders
 * still moving through the pipeline. No notifications table needed.
 */
export function NotificationBell({ orders }: { orders: Order[] }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const updates = orders
    .filter((o) => LIVE_STATUSES.includes(o.status))
    .slice(0, 6);

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

  function toggle() {
    setOpen((v) => !v);
    setSeen(true);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-label={
          updates.length > 0
            ? `Notifications, ${updates.length} active`
            : "Notifications"
        }
        aria-expanded={open}
        className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <BellIcon className="h-5 w-5" />
        {updates.length > 0 && !seen ? (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-(--radius-card) border border-border bg-card shadow-xl">
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
              {updates.map((o) => (
                <li key={o.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-card-foreground">
                      {o.reference}
                    </span>
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {o.customer} · {o.restaurant}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatShortDate(o.placedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
