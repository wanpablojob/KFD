import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchActiveRestaurants,
  fetchOrderFees,
  searchRestaurants,
  fetchMenu,
  fetchMyOrders,
  placeCustomerOrder,
  cancelOrder,
  fetchMyRatings,
  rateOrder,
  fetchOrderRiderPayment,
  setRiderGcash,
  fetchTrackedOrder,
  fetchRiderOrdersPage,
  fetchRiderOffers,
  fetchMyRiderApplication,
  submitRiderApplication,
  acceptRiderOffer,
  declineRiderOffer,
  markOrderPickedUp,
  fetchRiderProfile,
  fetchRiderEarningsSummary,
  fetchRiderPayoutHistory,
  type RiderOrderPageResult,
  type RiderOffer,
  type RiderApplication,
  type RiderProfile,
  type RestaurantRow,
  type MenuItemRow,
  type CustomerOrder,
  type PlaceOrderResult,
  type PlaceOrderItem,
  type PaymentChoice,
} from "./storefront";
import { isTerminalStatus } from "./order-progress";

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

/**
 * The unfiltered active catalogue, for copy that has to survive filtering --
 * currently the cuisine chips, which must keep offering every cuisine rather
 * than collapsing to the one that was just selected. Separate key from
 * useRestaurants so a search cannot evict it from the cache.
 */
export function useActiveRestaurants() {
  return useQuery({
    queryKey: ["restaurants", "catalogue"],
    queryFn: fetchActiveRestaurants,
    staleTime: 5 * 60 * 1000,
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

/**
 * Live tracking for one reference. Polls while the order is still moving and
 * stops the moment it reaches a terminal status; refetches when the app returns
 * to the foreground (focusManager is wired to AppState) so a customer watching
 * the screen sees the status move.
 */
export function useTrackOrder(reference: string, enabled: boolean) {
  return useQuery({
    queryKey: ["trackOrder", reference],
    queryFn: () => fetchTrackedOrder(reference),
    enabled: enabled && reference.trim().length > 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // undefined while the first fetch is in flight, which is not terminal.
      if (status && isTerminalStatus(status)) return false;
      return 15_000;
    },
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

/** Cancel the caller's own order. Invalidates the orders list on success. */
export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) => cancelOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders() });
    },
  });
}

/** The caller's own order ratings, so the list can show "Rated". */
export function useMyRatings() {
  return useQuery({
    queryKey: ["myRatings"],
    queryFn: fetchMyRatings,
  });
}

/** Rate a delivered order, then refresh the ratings list. */
export function useRateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: {
      orderId: string;
      restaurantRating: number;
      riderRating?: number | null;
      comment?: string | null;
    }) => rateOrder(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myRatings"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders() });
    },
  });
}

/**
 * The assigned rider's GCash QR for an e_wallet order. Null (no block shown)
 * unless the caller owns the order and a rider with a QR is assigned.
 */
export function useOrderRiderPayment(reference: string, enabled: boolean) {
  return useQuery({
    queryKey: ["orderRiderPayment", reference],
    queryFn: () => fetchOrderRiderPayment(reference),
    enabled: enabled && reference.trim().length > 0,
  });
}

/** A rider saving their GCash QR, refreshing their profile afterwards. */
export function useSetRiderGcash() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ qrUrl, name }: { qrUrl: string | null; name: string | null }) =>
      setRiderGcash(qrUrl, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["riderProfile"] }),
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

/**
 * Live offers for this rider.
 *
 * Polls rather than relying on a push, because an offer that silently went stale
 * is worse than one that showed up late: Accept would fail against a row that is
 * no longer claimable. 10s is under the 5-minute offer window with room to spare,
 * and the query is cheap (one indexed read of this rider's own offers).
 */
export function useRiderOffers() {
  return useQuery({
    queryKey: ["riderOffers"],
    queryFn: fetchRiderOffers,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

export function useAcceptOffer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) => acceptRiderOffer(orderId),
    onSuccess: () => {
      // The offer is gone and the order is now theirs: both lists are wrong.
      queryClient.invalidateQueries({ queryKey: ["riderOffers"] });
      queryClient.invalidateQueries({ queryKey: ["riderOrders"] });
      queryClient.invalidateQueries({ queryKey: ["riderEarningsSummary"] });
    },
  });
}

export function useDeclineOffer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) => declineRiderOffer(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["riderOffers"] });
    },
  });
}

/**
 * Rider confirms they have collected the food. The order becomes
 * out_for_delivery, which is the transition the tracker's progression has always
 * shown and nothing could set.
 *
 * Invalidates the deliveries list because that is where the card's own state
 * machine changes; the customer's tracker picks the new status up on its next
 * poll, so there is nothing to push here.
 */
export function useMarkPickedUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) => markOrderPickedUp(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["riderOrders"] });
    },
  });
}

export function useRiderEarningsSummary() {
  return useQuery({
    queryKey: ["riderEarningsSummary"],
    queryFn: () => fetchRiderEarningsSummary(),
  });
}

export function useRiderPayoutHistory(limit = 20) {
  return useQuery({
    queryKey: ["riderPayoutHistory", limit],
    queryFn: () => fetchRiderPayoutHistory(limit),
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
  RiderOffer,
  RiderProfile,
  RiderApplication,
};

/**
 * The signed-in user's own rider application. Query, not a mutation result:
 * the screen has to show pending/approved/rejected on every visit, including
 * after an admin decided while the app was closed.
 */
export function useMyRiderApplication() {
  return useQuery({
    queryKey: ["riderApplication"],
    queryFn: fetchMyRiderApplication,
  });
}

export function useSubmitRiderApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: submitRiderApplication,
    onSuccess: () => {
      // Re-read rather than trusting the returned id: the server is idempotent
      // and may have returned a pre-existing application.
      queryClient.invalidateQueries({ queryKey: ["riderApplication"] });
    },
  });
}
