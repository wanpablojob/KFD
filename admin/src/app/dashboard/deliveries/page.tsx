"use client";

import { fetchDeliveries } from "@/lib/supabase/delivery-queries";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { DeliveryList } from "@/components/delivery-list";
import { LoadingState, EmptyState } from "@/components/ui/status";
import { useAsyncData } from "@/lib/use-async-data";

/**
 * The trips: one basket from several shops, delivered in one trip.
 *
 * The orders list shows one row per shop, which is what a merchant and a
 * rider each need to see. A dispatcher needs the other half: which shops are
 * in this basket, who is carrying it, and what it is worth.
 */
export default function DeliveriesPage() {
  const { data, loading, error } = useAsyncData(() => fetchDeliveries());

  return (
    <PageContainer>
      <PageHeader
        title="Deliveries"
        description="Every basket, the shops in it, the rider carrying it and the money on it."
      />
      <Section aria-label="Delivery list">
        {loading ? (
          <LoadingState label="Loading deliveries…" />
        ) : error ? (
          <EmptyState title="Could not load deliveries" description={error} />
        ) : (
          <DeliveryList deliveries={data ?? []} />
        )}
      </Section>
    </PageContainer>
  );
}
