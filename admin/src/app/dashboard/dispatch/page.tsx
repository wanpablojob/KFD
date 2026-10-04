"use client";

import { useCallback, useState } from "react";
import {
  dispatchOrder,
  fetchDispatchRiders,
  fetchUnassignedOrders,
  type DispatchRider,
  type UnassignedOrder,
} from "@/lib/supabase/dispatch-queries";
import { formatCurrency } from "@/lib/format";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/status";
import { useAsyncData } from "@/lib/use-async-data";
import { supabase } from "@/lib/supabase/client";

/**
 * "5 minutes", "3 minutes" -- from the seconds the server reported.
 *
 * Rounded to whole minutes because that is the resolution anyone cares about,
 * and floored at one so a sub-minute window never reads as "Live for 0 minutes".
 */
function formatWindow(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

interface NotifyResult {
  notified: number;
  windowSeconds: number | null;
}

/**
 * Alert the riders an offer just went to.
 *
 * Best-effort and deliberately not awaited for its result: the offers are live
 * whether or not the push lands, so a failure here must not make the dispatch
 * look like it failed. If the call fails the board omits the "alerted" clause
 * instead of claiming a notification that never happened.
 */
async function notifyRidersOfOffer(orderId: string): Promise<NotifyResult> {
  const fallback: NotifyResult = { notified: 0, windowSeconds: null };
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return fallback;

    const res = await fetch("/api/dispatch/notify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ orderId }),
    });
    if (!res.ok) return fallback;
    const body = (await res.json()) as Partial<NotifyResult>;
    return {
      notified: body.notified ?? 0,
      windowSeconds: body.windowSeconds ?? null,
    };
  } catch {
    return fallback;
  }
}

/**
 * Dispatch: give orders to riders.
 *
 * This screen exists because nothing else could. Until migration 0035 the only
 * write of orders.rider_id in the schema was a one-time name-matching backfill,
 * so a new order could never reach a rider and the rider app's queue was always
 * empty.
 *
 * Two lists, because the decision is a pairing: orders with nobody on them, and
 * riders who are online. Dispatch pushes short-lived offers to every online
 * rider in the restaurant's city, or to a hand-picked set, and alerts them on
 * their device. The window is set by admin_dispatch_order and reported back
 * from it; this screen does not restate it.
 *
 * The awkward truth this screen has to be honest about: an order nobody claims
 * does not expire. It sits here. That is deliberate -- it is still a customer
 * waiting on food -- but it means the list grows, and an admin has to deal with
 * it. "Offers 0" therefore calls out the reason rather than showing a dead
 * button.
 */
export default function DispatchPage() {
  const orders = useAsyncData<UnassignedOrder[]>(fetchUnassignedOrders);
  const riders = useAsyncData<DispatchRider[]>(fetchDispatchRiders);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    orders.refetch();
    riders.refetch();
  }, [orders, riders]);

  async function send(
    order: UnassignedOrder,
    riderIds: string[] | null,
  ): Promise<void> {
    setBusy(order.orderId);
    setNotice(null);
    try {
      const count = await dispatchOrder(order.orderId, riderIds);

      // The offers are live at this point. Alert the riders, then report what
      // the server actually set, so this screen stops restating the window.
      let windowText = "";
      let pushed = 0;
      if (count > 0) {
        const res = await notifyRidersOfOffer(order.orderId);
        windowText = res.windowSeconds
          ? ` Live for ${formatWindow(res.windowSeconds)}.`
          : "";
        pushed = res.notified;
      }

      setNotice(
        count > 0
          ? `Offered ${order.reference} to ${count} rider${count === 1 ? "" : "s"}.${windowText}${pushed > 0 ? ` ${pushed} alerted on their device.` : ""}`
          : `No riders could be offered ${order.reference}. ${order.onlineRidersInCity} online in ${order.city}, and riders who already declined are not asked again.`,
      );
      refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Dispatch failed.");
    } finally {
      setBusy(null);
    }
  }

  const onlineRiders = (riders.data ?? []).filter((r) => r.status === "online");

  return (
    <PageContainer>
      <PageHeader
        title="Dispatch"
        description="Orders waiting for a rider. Sending an offer makes it claimable for a few minutes and alerts the riders you sent it to."
      />

      {notice ? (
        <Card className="border-accent/40 bg-accent/5 px-4 py-3 text-sm">
          {notice}
        </Card>
      ) : null}

      <Section aria-label="Unassigned orders" className="mt-8">
        <h2 className="mb-1 text-lg font-semibold text-card-foreground">
          Unassigned orders
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          An order nobody claims does not expire. It stays here until someone
          takes it.
        </p>
        {orders.loading ? (
          <p className="text-sm text-muted">Loading orders…</p>
        ) : orders.error ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-danger">{orders.error}</p>
            <Button size="sm" variant="outline" onClick={orders.refetch}>
              Retry
            </Button>
          </div>
        ) : (orders.data ?? []).length === 0 ? (
          <EmptyState
            title="Every order has a rider"
            description="Nothing is waiting for dispatch right now."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {(orders.data ?? []).map((order) => (
              <OrderDispatchCard
                key={order.orderId}
                order={order}
                riders={onlineRiders}
                busy={busy === order.orderId}
                onSendCity={() => void send(order, null)}
                onSendRiders={(ids) => void send(order, ids)}
              />
            ))}
          </div>
        )}
      </Section>

      <Section aria-label="Riders online" className="mt-8">
        <h2 className="mb-1 text-lg font-semibold text-card-foreground">
          Riders online
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {onlineRiders.length} of {(riders.data ?? []).length} online. Offers
          only reach riders who are online.
        </p>
        {riders.loading ? (
          <p className="text-sm text-muted">Loading riders…</p>
        ) : riders.error ? (
          <p className="text-sm text-danger">{riders.error}</p>
        ) : (riders.data ?? []).length === 0 ? (
          <EmptyState
            title="No riders yet"
            description="Riders appear here once provisioned and set to online."
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(riders.data ?? []).map((rider) => (
              <div
                key={rider.riderId}
                className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{rider.name}</p>
                  <p className="truncate text-xs text-muted">
                    {rider.city} · {rider.vehicle} · {rider.deliveries}{" "}
                    delivered
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {rider.activeOffers > 0 ? (
                    <Badge variant="warning">
                      {rider.activeOffers} offered
                    </Badge>
                  ) : null}
                  <Badge
                    variant={rider.status === "online" ? "success" : "neutral"}
                  >
                    {rider.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </PageContainer>
  );
}

function OrderDispatchCard({
  order,
  riders,
  busy,
  onSendCity,
  onSendRiders,
}: {
  order: UnassignedOrder;
  riders: DispatchRider[];
  busy: boolean;
  onSendCity: () => void;
  onSendRiders: (ids: string[]) => void;
}) {
  // Riders who could plausibly take this one: online, and in the restaurant's
  // city. Admin can override, but the default button should be the sensible one.
  const inCity = riders.filter((r) => r.city === order.city);

  return (
    <Card className="flex flex-col gap-3 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{order.reference}</span>
            <Badge variant="neutral">{order.status}</Badge>
            {order.liveOffers > 0 ? (
              <Badge variant="warning">{order.liveOffers} live offer</Badge>
            ) : null}
            {order.declines > 0 ? (
              <Badge variant="destructive">{order.declines} declined</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm">
            {order.restaurant} → {order.customer}
          </p>
          <p className="text-xs text-muted">{order.deliveryAddress}</p>
          <p className="mt-1 text-xs text-muted">
            {order.items
              .map((line) => `${line.quantity}× ${line.name}`)
              .join(", ") || "No items listed"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold">{formatCurrency(order.total)}</p>
          <p className="text-xs text-muted">{order.city}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onSendCity} disabled={busy}>
          {order.onlineRidersInCity > 0
            ? `Offer to ${order.onlineRidersInCity} online in ${order.city}`
            : `No riders online in ${order.city}`}
        </Button>

        {inCity.length > 0 ? (
          <select
            aria-label={`Send ${order.reference} to a specific rider`}
            className="h-8 rounded-(--radius-sm) border border-border bg-card px-2 text-xs"
            value=""
            onChange={(event) => {
              const id = event.target.value;
              if (id) onSendRiders([id]);
            }}
            disabled={busy}
          >
            <option value="">Pick a rider…</option>
            {inCity.map((rider) => (
              <option key={rider.riderId} value={rider.riderId}>
                {rider.name} ({rider.city})
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </Card>
  );
}
