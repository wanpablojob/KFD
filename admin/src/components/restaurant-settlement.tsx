"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EntityDialog } from "@/components/ui/entity-dialog";
import { formatCurrency } from "@/lib/format";
import { useAsyncData } from "@/lib/use-async-data";
import {
  fetchRestaurantOwed,
  payRestaurant,
  setCommission,
} from "@/lib/supabase/settlement-queries";

/**
 * What KFD owes this shop for its delivered orders, and recording the payment
 * (0138). The commission rate is platform-wide; it is changed here because
 * this is where it is felt.
 */
export function RestaurantSettlement({
  restaurantId,
  name,
}: {
  restaurantId: string;
  name: string;
}) {
  const owed = useAsyncData(
    () => fetchRestaurantOwed(restaurantId),
    restaurantId,
  );
  const [paying, setPaying] = useState(false);
  const [rating, setRating] = useState(false);
  const o = owed.data;

  return (
    <Card className="mb-6 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-card-foreground">
            Owed to the shop
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Food from delivered orders not yet paid, less refunds and KFD&apos;s
            commission.
          </p>
          {o ? (
            <>
              <p className="mt-3 text-2xl font-semibold text-card-foreground">
                {formatCurrency(o.net)}
              </p>
              <p className="text-xs text-muted-foreground">
                {o.orderCount} orders · food {formatCurrency(o.foodTotal)} ·
                refunds {formatCurrency(o.refunds)} · commission{" "}
                {o.commissionPct}% ({formatCurrency(o.commission)})
                {o.lastPaidAt
                  ? ` · last paid ${new Date(o.lastPaidAt).toLocaleDateString()}`
                  : ""}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {owed.loading
                ? "Loading…"
                : (owed.error ?? "Nothing recorded yet.")}
            </p>
          )}
        </div>
        <span className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setRating(true)}>
            Commission
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!o || o.orderCount === 0}
            onClick={() => setPaying(true)}
          >
            Mark as paid
          </Button>
        </span>
      </div>

      {paying && o ? (
        <EntityDialog
          open
          key={`pay-${restaurantId}`}
          title={`Pay ${name} ${formatCurrency(o.net)}`}
          description={`Send the money first, then record it here. This covers ${o.orderCount} delivered orders.`}
          onClose={() => setPaying(false)}
          initial={{ method: "gcash" }}
          fields={[
            {
              key: "method",
              label: "Paid by",
              required: true,
              options: [
                { value: "gcash", label: "GCash" },
                { value: "cash", label: "Cash" },
              ],
            },
            {
              key: "reference",
              label: "GCash reference number (required for GCash)",
              type: "text",
              placeholder: "e.g. 1234 567 890",
            },
          ]}
          onSave={async (values) => {
            await payRestaurant(
              restaurantId,
              values.method === "cash" ? "cash" : "gcash",
              values.reference,
            );
            await owed.refetch();
            setPaying(false);
          }}
        />
      ) : null}

      {rating && o ? (
        <EntityDialog
          open
          key={`rate-${restaurantId}`}
          title="KFD commission"
          description="KFD's cut of every shop's food sales, from 0% to 50%. It applies to payments made from now on; past payments keep the rate they were made at."
          onClose={() => setRating(false)}
          initial={{ pct: String(o.commissionPct) }}
          fields={[
            {
              key: "pct",
              label: "Commission (%)",
              type: "number",
              required: true,
            },
          ]}
          onSave={async (values) => {
            const pct = Number(values.pct);
            if (!Number.isFinite(pct) || pct < 0 || pct > 50) {
              throw new Error("Enter a number from 0 to 50.");
            }
            await setCommission(pct);
            await owed.refetch();
            setRating(false);
          }}
        />
      ) : null}
    </Card>
  );
}
