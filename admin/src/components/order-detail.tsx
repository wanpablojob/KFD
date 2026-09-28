"use client";

import type { Order, OrderStatus } from "@/lib/types";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { StatusBadge } from "./ui/status-badge";
import { Badge } from "./ui/badge";
import { Avatar } from "./ui/avatar";
import { BikeIcon, MapPinIcon, UserIcon } from "./ui/icons";
import { cn } from "@/lib/utils";

const timelineSteps: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
];

const paymentLabels: Record<Order["payment"], string> = {
  cash: "Cash",
  card: "Card",
  e_wallet: "E-wallet",
};

export function OrderDetail({ order }: { order: Order }) {
  const currentIndex =
    order.status === "cancelled"
      ? -1
      : timelineSteps.indexOf(order.status);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={order.status} />
        <Badge variant="secondary" size="md">
          {paymentLabels[order.payment]}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(order.placedAt)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-2.5">
          <Avatar name={order.customer} size="sm" />
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
              <UserIcon className="h-3 w-3" /> Customer
            </p>
            <p className="truncate text-sm font-medium text-card-foreground">
              {order.customer}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <MapPinIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Restaurant
            </p>
            <p className="truncate text-sm font-medium text-card-foreground">
              {order.restaurant}
            </p>
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-card-foreground">Items</p>
        <ul className="divide-y divide-border/70 rounded-lg border border-border">
          {order.items.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              No items recorded.
            </li>
          ) : (
            order.items.map((item, i) => (
              <li
                key={`${item.name}-${i}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <span className="text-card-foreground">
                  <span className="font-medium">{item.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    ×{item.quantity}
                  </span>
                </span>
                <span className="font-medium tabular-nums text-card-foreground">
                  {formatCurrency(item.price * item.quantity)}
                </span>
              </li>
            ))
          )}
        </ul>

        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums text-card-foreground">
              {formatCurrency(order.subtotal)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Delivery fee</dt>
            <dd className="tabular-nums text-card-foreground">
              {formatCurrency(order.deliveryFee)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5">
            <dt className="font-semibold text-card-foreground">Total</dt>
            <dd className="font-semibold tabular-nums text-card-foreground">
              {formatCurrency(order.total)}
            </dd>
          </div>
        </dl>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-card-foreground">
          <BikeIcon className="h-4 w-4 text-muted-foreground" /> Rider
        </p>
        <p className="text-sm text-card-foreground">
          {order.rider === "Unassigned" ? (
            <span className="text-muted-foreground">Unassigned yet</span>
          ) : (
            order.rider
          )}
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-card-foreground">
          Timeline
        </p>
        {order.status === "cancelled" ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
            <p className="font-medium text-destructive">Order cancelled</p>
            {/* The merchant's stated reason, persisted as of Prompt 2.5. Orders
                cancelled before that column existed have none, and no reason is
                ever fabricated to fill the gap -- the absence is stated so a
                reviewer can see that nothing was recorded rather than reading
                silence as "no reason given". */}
            <p className="mt-1.5 text-muted-foreground">
              {order.rejectionReason ? (
                <>
                  <span className="font-medium text-card-foreground">Reason: </span>
                  {order.rejectionReason}
                </>
              ) : (
                "No reason recorded"
              )}
            </p>
          </div>
        ) : (
          <ol className="space-y-0">
            {timelineSteps.map((step, i) => {
              const done = i <= currentIndex;
              const current = i === currentIndex;
              return (
                <li key={step} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "mt-0.5 h-2.5 w-2.5 rounded-full ring-4",
                        done
                          ? "bg-primary ring-primary/20"
                          : "bg-border ring-transparent",
                      )}
                    />
                    {i < timelineSteps.length - 1 ? (
                      <span
                        className={cn(
                          "w-px flex-1",
                          i < currentIndex ? "bg-primary/40" : "bg-border",
                        )}
                      />
                    ) : null}
                  </div>
                  <div className="pb-4">
                    <p
                      className={cn(
                        "text-sm capitalize",
                        current
                          ? "font-semibold text-primary"
                          : done
                            ? "font-medium text-card-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {step.replace(/_/g, " ")}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}