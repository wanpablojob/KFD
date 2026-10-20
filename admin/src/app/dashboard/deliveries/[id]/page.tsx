"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchDeliveryDetail } from "@/lib/supabase/delivery-queries";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { LoadingState, EmptyState } from "@/components/ui/status";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { useAsyncData } from "@/lib/use-async-data";

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting for the shops",
  confirmed: "All shops accepted",
  preparing: "Being prepared",
  out_for_delivery: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/**
 * One trip in full.
 *
 * This is the view the orders list cannot give: the shops in the basket and
 * what each of them is doing, the fees the customer was charged, the rider who
 * took it, what they were paid, and what was collected in cash against the
 * grand total.
 */
export default function DeliveryDetailPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const { data, loading, error } = useAsyncData(
    () => fetchDeliveryDetail(id),
    id,
  );

  if (loading) {
    return (
      <PageContainer>
        <LoadingState label="Loading delivery…" />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <EmptyState title="Could not load this delivery" description={error} />
      </PageContainer>
    );
  }

  if (!data) {
    return (
      <PageContainer>
        <EmptyState
          title="No such delivery"
          description="It may have been created before deliveries were tracked."
        />
      </PageContainer>
    );
  }

  const cash = data.cash[0];

  return (
    <PageContainer>
      <PageHeader
        title={data.reference}
        description={`${data.customer} · ${data.shops} ${
          data.shops === 1 ? "restaurant" : "restaurants"
        } · ${STATUS_LABEL[data.status] ?? data.status}`}
        actions={
          <Link
            href="/dashboard/deliveries"
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            All deliveries
          </Link>
        }
      />

      <Section aria-label="Delivery">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={data.status as never} />
            {data.rider ? (
              <Badge variant="secondary" size="md">
                Rider: {data.rider}
              </Badge>
            ) : (
              <Badge variant="outline" size="md">
                No rider yet
              </Badge>
            )}
            {data.feeAgreedInPerson ? (
              <Badge variant="warning" size="md">
                Fee agreed at the door
              </Badge>
            ) : null}
            <span className="text-xs text-muted-foreground">
              Placed {formatDateTime(data.placedAt)}
              {data.deliveredAt ? ` · delivered ${formatDateTime(data.deliveredAt)}` : ""}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-(--radius-card) border border-border bg-card p-4">
              <p className="text-sm font-medium text-card-foreground">
                Deliver to
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.customer}
                <br />
                {data.deliveryAddress}
                {data.deliveryBarangay ? ` · ${data.deliveryBarangay}` : ""}
              </p>
              {data.customerPhone ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {data.customerPhone}
                </p>
              ) : null}
            </div>

            <div className="rounded-(--radius-card) border border-border bg-card p-4">
              <p className="text-sm font-medium text-card-foreground">The money</p>
              <dl className="mt-1 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>{formatCurrency(data.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Delivery fee</dt>
                  <dd>{formatCurrency(data.deliveryFee)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Service fee</dt>
                  <dd>{formatCurrency(data.serviceFee)}</dd>
                </div>
                <div className="flex justify-between font-medium">
                  <dt>Total</dt>
                  <dd>{formatCurrency(data.total)}</dd>
                </div>
              </dl>
              {cash ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Collected {formatCurrency(cash.amountCollected)} against{" "}
                  {formatCurrency(cash.amountExpected)}
                  {cash.variance !== 0
                    ? ` · variance ${formatCurrency(cash.variance)}`
                    : ""}
                </p>
              ) : null}
              {data.riderPayout !== null ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Rider paid {formatCurrency(data.riderPayout)}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-medium text-card-foreground">
              The shops ({data.stops.length})
            </h2>
            <ul className="mt-2 divide-y divide-border/70 rounded-(--radius-card) border border-border">
              {data.stops.map((stop) => (
                <li key={stop.orderId} className="space-y-1 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-card-foreground">
                      {stop.restaurant}
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={stop.status as never} />
                      <span className="text-sm text-muted-foreground">
                        {formatCurrency(stop.total)}
                      </span>
                    </span>
                  </div>
                  {stop.items.length > 0 ? (
                    <ul className="text-xs text-muted-foreground">
                      {stop.items.map((item, index) => (
                        <li key={`${stop.orderId}-${index}`}>
                          {item.quantity}× {item.name} ·{" "}
                          {formatCurrency(item.price * item.quantity)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {stop.rejectionReason ? (
                    <p className="text-xs text-muted-foreground">
                      Rejected: {stop.rejectionReason}
                    </p>
                  ) : null}
                  {stop.deliveryFailedReason ? (
                    <p className="text-xs text-muted-foreground">
                      Delivery failed: {stop.deliveryFailedReason}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          {data.payouts.length > 0 ? (
            <div>
              <h2 className="text-sm font-medium text-card-foreground">
                Rider payouts
              </h2>
              <ul className="mt-2 divide-y divide-border/70 rounded-(--radius-card) border border-border">
                {data.payouts.map((payout) => (
                  <li
                    key={payout.orderId}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                  >
                    <span className="text-muted-foreground">
                      {payout.orderId}
                      {payout.gcashReference ? ` · ${payout.gcashReference}` : ""}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" size="sm">
                        {payout.settlementState.replace(/_/g, " ")}
                      </Badge>
                      <span className="font-medium">
                        {formatCurrency(payout.amount)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Section>
    </PageContainer>
  );
}
