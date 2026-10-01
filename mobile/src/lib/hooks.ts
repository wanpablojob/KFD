import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchActiveRestaurants,
  fetchOrderFees,
  searchRestaurants,
  fetchMenu,
  fetchMyOrders,
  placeCustomerOrder,
  fetchRiderOrdersPage,
  fetchRiderProfile,
  type RiderOrderPageResult,
  type RiderProfile,
  type RestaurantRow,
  type MenuItemRow,
  type CustomerOrder,
  type PlaceOrderResult,
  type PlaceOrderItem,
  type PaymentChoice,
} from "./storefront";

export const queryKeys = {
  restaurants: (query: string, cuisine: string | null) =>
    ["restaurants", query, cuisine] as const,
  menu: (restaurantId: string) => ["menu", restaurantId] as const,
  orders: () => ["orders"] as const,
  orderFees: () => ["order-fees"] as const,
};

/** Delivery fee for copy that needs a number before a cart exists. */
export function useOrderFees() {
  return useQuery({
    queryKey: queryKeys.orderFees(),
    queryFn: fetchOrderFees,
    // Platform-wide and effectively static; do not refetch on every focus.
    staleTime: 15 * 60 * 1000,
  });
}

export function useRestaurants(query: string = "", cuisine: string | null = null) {
  const key = queryKeys.restaurants(query, cuisine);
  return useQuery({
    queryKey: key,
    queryFn: () =>
      query || cuisine ? searchRestaurants(query, cuisine) : fetchActiveRestaurants(),
    placeholderData: (prev) => prev,
  });
}

export function useMenu(restaurantId: string) {
  return useQuery({
    queryKey: queryKeys.menu(restaurantId),
    queryFn: () => fetchMenu(restaurantId),
    enabled: !!restaurantId,
    placeholderData: (prev) => prev,
  });
}

export function useMyOrders() {
  return useQuery({
    queryKey: queryKeys.orders(),
    queryFn: fetchMyOrders,
    placeholderData: (prev) => prev,
  });
}

export function usePlaceOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: {
      restaurantId: string;
      items: PlaceOrderItem[];
      deliveryAddress: string;
      payment: PaymentChoice;
    }) => placeCustomerOrder(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders() });
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
  });
}

export function useSearchRestaurants(query: string, cuisine: string | null) {
  return useQuery({
    queryKey: queryKeys.restaurants(query, cuisine),
    queryFn: () => searchRestaurants(query, cuisine),
    enabled: query.length > 0 || !!cuisine,
    placeholderData: (prev) => prev,
  });
}

export function useRiderOrders(initialCursor: string | null = null, limit = 20) {
  return useQuery({
    queryKey: ["riderOrders", initialCursor],
    queryFn: () => fetchRiderOrdersPage(initialCursor, limit),
    placeholderData: (prev) => prev,
  });
}

export function useRiderProfile(userId: string) {
  return useQuery({
    queryKey: ["riderProfile", userId],
    queryFn: () => fetchRiderProfile(userId),
    enabled: !!userId,
  });
}

export type {
  RestaurantRow,
  MenuItemRow,
  CustomerOrder,
  PlaceOrderResult,
  PlaceOrderItem,
  PaymentChoice,
  RiderOrderPageResult,
  RiderProfile,
};
