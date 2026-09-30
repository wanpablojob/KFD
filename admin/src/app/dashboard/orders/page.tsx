"use client";

import { fetchOrders } from "@/lib/supabase/queries";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { OrderList } from "@/components/order-list";
import { LoadingState, EmptyState } from "@/components/ui/status";
import { useAsyncData } from "@/lib/use-async-data";

export default function OrdersPage() {
  const { data, loading, error } = useAsyncData(() => fetchOrders());

  return (
    <PageContainer>
      <PageHeader
        title="Orders"
        description="Track, filter, and manage every order across KFD."
      />
      <Section aria-label="Order list">
        {loading ? (
          <LoadingState label="Loading orders…" />
        ) : error ? (
          <EmptyState title="Could not load orders" description={error} />
        ) : (
          <OrderList orders={data ?? []} />
        )}
      </Section>
    </PageContainer>
  );
}