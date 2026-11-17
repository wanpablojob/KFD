"use client";

import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STALL_MINUTES, formatStallAge, type StalledOrder } from "@/lib/stuck-orders";

/**
 * Orders that stopped moving while a rider had them.
 *
 * This is the list that exists for one failure the other screens cannot show:
 * the rider's phone is off, dead or out of signal, so the order keeps its
 * rider, never fails, and sits "on the way" forever. Nothing here is a control
 * -- the dispatcher opens the order and reassigns or cancels it -- because a
 * stall is a fact the database recorded, not a state the admin invents.
 *
 * Renders nothing when there is nothing stalled, so an empty section never
 * takes room on the overview.
 */
export function StalledOrders({ stalls }: { stalls: StalledOrder[] }) {
  if (stalls.length === 0) return null;

  return (
    <Card>
      <div id="stalled-orders" className="scroll-mt-24">
        <CardHeader
          title={`Stalled with a rider (${stalls.length})`}
          subtitle={`Still open, a rider on it, no movement for over ${STALL_MINUTES} minutes — the rider's phone may be off or dead`}
        />
      </div>
      <ul className="divide-y divide-border/70 px-5 pb-3">
        {stalls.map((stall) => (
          <li
            key={stall.orderId}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-card-foreground">
                {stall.reference} · {stall.restaurant}
                <Badge variant="destructive" size="sm">
                  {stall.stage === "out_for_delivery" ? "On the way" : "Preparing"}
                </Badge>
              </p>
              <p className="text-xs text-muted-foreground">
                {stall.riderName ? `Rider ${stall.riderName}` : "Rider not named on the order"}
                {" · "}
                nothing has moved for {formatStallAge(stall.minutes)}
              </p>
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/dashboard/orders?order=${encodeURIComponent(stall.reference)}`}>
                Open order
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
