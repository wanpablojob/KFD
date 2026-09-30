"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { fetchRestaurants, fetchOrdersByRestaurant, fetchMenuItemsByRestaurant } from "@/lib/supabase/queries";
import { formatCurrency } from "@/lib/format";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { PaginatedDataTable } from "@/components/ui/paginated-data-table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon, UtensilsIcon, ReceiptIcon } from "@/components/ui/icons";
import Link from "next/link";
import { useAsyncData } from "@/lib/use-async-data";
import { TableBoundary } from "@/components/ui/table-boundary";
import type { Column } from "@/components/ui/data-table";
import type { Order, MenuItem } from "@/lib/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const orderColumns: Column<Order>[] = [
  {
    key: "reference",
    header: "Reference",
    cell: (row) => <span className="font-medium text-card-foreground">{row.reference}</span>,
  },
  {
    key: "customer",
    header: "Customer",
    cell: (row) => (
      <span className="flex items-center gap-2.5">
        <Avatar name={row.customer} size="sm" />
        <span className="text-card-foreground">{row.customer}</span>
      </span>
    ),
  },
  {
    key: "total",
    header: "Total",
    align: "right",
    cell: (row) => <span className="font-medium text-card-foreground">{formatCurrency(row.total)}</span>,
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: "rider",
    header: "Rider",
    cell: (row) =>
      row.rider === "Unassigned" ? (
        <Badge variant="warning" size="sm">Unassigned</Badge>
      ) : (
        <span className="text-card-foreground">{row.rider}</span>
      ),
  },
  {
    key: "payment",
    header: "Payment",
    cell: (row) => (
      <Badge variant="secondary" size="sm">{row.payment.replace(/_/g, " ")}</Badge>
    ),
  },
  {
    key: "placedAt",
    header: "Placed",
    cell: (row) => <span className="whitespace-nowrap text-muted-foreground">{row.placedAt}</span>,
  },
];

const menuColumns: Column<MenuItem>[] = [
  {
    key: "name",
    header: "Item",
    cell: (row) => <span className="font-medium text-card-foreground">{row.name}</span>,
  },
  {
    key: "category",
    header: "Category",
    cell: (row) => <Badge variant="secondary" size="sm">{row.category}</Badge>,
  },
  {
    key: "price",
    header: "Price",
    align: "right",
    cell: (row) => <span className="font-medium text-card-foreground">{formatCurrency(row.price)}</span>,
  },
  {
    key: "available",
    header: "Status",
    cell: (row) =>
      row.available ? (
        <Badge variant="success" size="sm">Available</Badge>
      ) : (
        <Badge variant="destructive" size="sm">Sold out</Badge>
      ),
  },
];

export default function RestaurantDetailPage() {
  const params = useParams();
  const restaurantId = params.id as string;
  const [activeTab, setActiveTab] = useState("menu");

  const { data: restaurants, loading: restaurantsLoading, error: restaurantsError } = useAsyncData(() =>
    fetchRestaurants(),
  );
  const { data: orders, loading: ordersLoading, error: ordersError } = useAsyncData(() =>
    fetchOrdersByRestaurant(
      restaurants?.find((r) => r.id === restaurantId)?.name ?? "",
    ),
  );
  const { data: menuItems, loading: menuLoading, error: menuError } = useAsyncData(() =>
    fetchMenuItemsByRestaurant(
      restaurants?.find((r) => r.id === restaurantId)?.name ?? "",
    ),
  );

  const restaurant = restaurants?.find((r) => r.id === restaurantId);
  const loading = restaurantsLoading || ordersLoading || menuLoading;
  const error = restaurantsError || ordersError || menuError;

  if (loading) {
    return (
      <PageContainer>
        <PageHeader title="Loading…" />
      </PageContainer>
    );
  }

  // A failed fetch would otherwise fall through to "Restaurant not found",
  // which reads as a deleted restaurant rather than a network or RLS problem.
  if (error) {
    return (
      <PageContainer>
        <PageHeader
          title="Could not load this restaurant"
          description={error}
        />
      </PageContainer>
    );
  }

  if (!restaurant) {
    return (
      <PageContainer>
        <PageHeader title="Restaurant not found" description="The requested restaurant does not exist." />
      </PageContainer>
    );
  }

  const availableCount = menuItems?.filter((m) => m.available).length ?? 0;
  const totalMenuItems = menuItems?.length ?? 0;

  return (
    <PageContainer>
      <PageHeader
        title={restaurant.name}
        description={`${restaurant.cuisine} · ${restaurant.city}`}
        actions={
          <Link href="/restaurants">
            <Button variant="outline" size="sm">
              <ArrowLeftIcon className="h-4 w-4" />
              Back to Restaurants
            </Button>
          </Link>
        }
      />

      <Section aria-label="Restaurant details">
        <Card className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-5">
            <Avatar name={restaurant.name} size="lg" />
            <div className="space-y-1">
              <p className="text-lg font-semibold text-card-foreground">{restaurant.name}</p>
              <p className="text-muted-foreground">{restaurant.cuisine} · {restaurant.city}</p>
              <p className="text-sm text-muted-foreground">
                Rating: {restaurant.rating} ★ · {restaurant.ordersCount} orders · {formatCurrency(restaurant.revenue)} revenue
              </p>
              <p className="text-xs text-muted-foreground">
                Status: {restaurant.status} · Joined {restaurant.joinedAt}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 ml-auto">
              <Badge variant={restaurant.status === "active" ? "success" : "secondary"} size="sm">
                {restaurant.status}
              </Badge>
              <Badge variant="secondary" size="sm">{availableCount}/{totalMenuItems} items available</Badge>
            </div>
          </div>
        </Card>
      </Section>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList aria-label="Restaurant details">
          <TabsTrigger value="menu">
            <UtensilsIcon className="h-4 w-4" />
            Menu ({totalMenuItems})
          </TabsTrigger>
          <TabsTrigger value="orders">
            <ReceiptIcon className="h-4 w-4" />
            Order History ({orders?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="menu">
          <TableBoundary
            loading={menuLoading}
            error={menuError}
            onRetry={() => {}}
            errorTitle="Could not load menu"
            skeletonRows={5}
            skeletonColumns={4}
          >
            <Card className="overflow-hidden">
              {menuItems && menuItems.length > 0 ? (
                <PaginatedDataTable<MenuItem>
                  columns={menuColumns}
                  rows={menuItems}
                  searchFields={["name", "category"]}
                  emptyTitle="No menu items"
                  emptyDescription="This restaurant has not added any menu items yet."
                  exportName={`restaurant-${restaurant.name}-menu`}
                  exportColumns={[
                    { key: "name", header: "Item" },
                    { key: "category", header: "Category" },
                    { key: "price", header: "Price", format: (row) => formatCurrency(row.price) },
                    { key: "available", header: "Status" },
                  ]}
                />
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  No menu items found.
                </div>
              )}
            </Card>
          </TableBoundary>
        </TabsContent>

        <TabsContent value="orders">
          <TableBoundary
            loading={ordersLoading}
            error={ordersError}
            onRetry={() => {}}
            errorTitle="Could not load order history"
            skeletonRows={5}
            skeletonColumns={7}
          >
            <Card className="overflow-hidden">
              {orders && orders.length > 0 ? (
                <PaginatedDataTable<Order>
                  columns={orderColumns}
                  rows={orders}
                  searchFields={["reference", "customer", "status", "rider", "payment"]}
                  emptyTitle="No orders found"
                  emptyDescription="This restaurant has not received any orders yet."
                  exportName={`restaurant-${restaurant.name}-orders`}
                  exportColumns={[
                    { key: "reference", header: "Reference" },
                    { key: "customer", header: "Customer" },
                    { key: "total", header: "Total", format: (row) => formatCurrency(row.total) },
                    { key: "status", header: "Status" },
                    { key: "rider", header: "Rider" },
                    { key: "payment", header: "Payment" },
                    { key: "placedAt", header: "Placed" },
                  ]}
                />
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  No orders found.
                </div>
              )}
            </Card>
          </TableBoundary>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}