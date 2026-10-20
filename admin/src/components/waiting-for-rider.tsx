"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  dispatchDelivery,
  dispatchOrder,
  notifyRidersOfDeliveryOffer,
  notifyRidersOfOffer,
  type PendingDelivery,
} from "@/lib/supabase/dispatch-queries";
import type { Order } from "@/lib/types";

/**
 * Accepted orders with no rider: the manual safety net under auto-dispatch.
 *
 * Accepting an order offers it to riders automatically (0085), but an offer
 * lasts 5 minutes and nothing re-sends it, so an order nobody claimed, or one a
 * rider gave up on, lands here. Re-offer sends it to every online rider in the
 * restaurant's city again and alerts their phones.
 */
export function WaitingForRider({
  orders,
  deliveries,
  now,
  onChanged,
}: {
  orders: Order[];
  /** Trips waiting for a rider (0093). */
  deliveries: PendingDelivery[];
  now: Date;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const waiting = orders
    .filter((o) => (o.status === "confirmed" || o.status === "preparing") && !o.rider)
    .sort((a, b) => a.placedAt.localeCompare(b.placedAt));

  /** Re-offer a whole trip: one rider takes every shop in the basket. */
  async function reofferDelivery(deliveryId: string) {
    setBusy(deliveryId);
    try {
      const offered = await dispatchDelivery(deliveryId);
      const alert = offered > 0 ? await notifyRidersOfDeliveryOffer(deliveryId) : null;
      setNotes((n) => ({
        ...n,
        [deliveryId]:
          offered === 0
            ? "No rider is online in this city right now."
            : `Offered to ${offered} ${offered === 1 ? "rider" : "riders"}${alert && alert.notified > 0 ? `, ${alert.notified} alerted` : ""}.`,
      }));
      onChanged();
    } catch (cause) {
      setNotes((n) => ({
        ...n,
        [deliveryId]:
          cause instanceof Error ? cause.message : "Could not re-offer this trip.",
      }));
    } finally {
      setBusy(null);
    }
  }

  if (waiting.length === 0 && deliveries.length === 0) return null;

  async function reoffer(orderId: string) {
    setBusy(orderId);
    try {
      const offered = await dispatchOrder(orderId);
      const alert = offered > 0 ? await notifyRidersOfOffer(orderId) : null;
      setNotes((n) => ({
        ...n,
        [orderId]:
          offered === 0
            ? "No rider is online in this restaurant's city right now."
            : `Offered to ${offered} ${offered === 1 ? "rider" : "riders"}${alert && alert.notified > 0 ? `, ${alert.notified} alerted` : ""}.`,
      }));
      onChanged();
    } catch (cause) {
      setNotes((n) => ({
        ...n,
        [orderId]: cause instanceof Error ? cause.message : "Could not re-offer this order.",
      }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <div id="waiting-for-rider" className="scroll-mt-24">
        <CardHeader
          title="Waiting for a rider"
          subtitle="Accepted orders nobody has claimed, oldest first"
        />
      </div>
      <ul className="divide-y divide-border/70 px-5 pb-3">
        {/* Trips first (0093): a basket from several shops is one job. */}
        {deliveries.map((d) => {
          const minutes = Math.max(0, Math.floor((now.getTime() - new Date(d.placedAt).getTime()) / 60000));
          return (
            <li key={d.deliveryId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-card-foreground">
                  {d.reference} · {d.shops === 1 ? "1 restaurant" : `${d.shops} restaurants`}
                  <Badge variant="secondary" size="sm">Trip</Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  Placed {minutes} min ago · ₱{d.total.toFixed(2)}
                </p>
                {notes[d.deliveryId] ? (
                  <p className="mt-1 text-xs text-muted-foreground" role="status">{notes[d.deliveryId]}</p>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="outline"
                loading={busy === d.deliveryId}
                disabled={busy !== null}
                onClick={() => void reofferDelivery(d.deliveryId)}
              >
                Re-offer
              </Button>
            </li>
          );
        })}
        {waiting.map((o) => {
          const minutes = Math.max(0, Math.floor((now.getTime() - new Date(o.placedAt).getTime()) / 60000));
          return (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-card-foreground">
                  {o.reference} · {o.restaurant}
                  {o.deliveryFailedReason ? (
                    <Badge variant="destructive" size="sm">Delivery failed</Badge>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  Placed {minutes} min ago
                  {o.deliveryFailedReason ? ` · ${o.deliveryFailedReason}` : ""}
                </p>
                {notes[o.id] ? (
                  <p className="mt-1 text-xs text-muted-foreground" role="status">{notes[o.id]}</p>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="outline"
                loading={busy === o.id}
                disabled={busy !== null}
                onClick={() => void reoffer(o.id)}
              >
                Re-offer
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
