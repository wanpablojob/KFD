/**
 * What the customer Home tab shows, from data the app already loads: the
 * order on its way (if any), kitchens they ordered from before, their saved
 * favourites, and what is open right now. The full list lives on Shops.
 */

const IN_PROGRESS = ["pending", "confirmed", "preparing", "out_for_delivery"];

interface HomeOrder {
  reference: string;
  restaurant_id: string | null;
  status: string;
  placed_at: string;
}

interface HomeRestaurant {
  id: string;
  is_open: boolean;
  rating: number;
}

export function homeSections<R extends HomeRestaurant>(
  orders: HomeOrder[],
  restaurants: R[],
  favoriteIds: string[]
) {
  const byId = new Map(restaurants.map((r) => [r.id, r]));
  const newestFirst = [...orders].sort((a, b) =>
    b.placed_at.localeCompare(a.placed_at)
  );

  // Most recent first, each kitchen once, only ones still on the catalogue.
  const seen = new Set<string>();
  const orderAgain: R[] = [];
  for (const o of newestFirst) {
    const r =
      o.status === "delivered" && o.restaurant_id
        ? byId.get(o.restaurant_id)
        : undefined;
    if (r && !seen.has(r.id)) {
      seen.add(r.id);
      orderAgain.push(r);
    }
  }

  return {
    activeOrder: newestFirst.find((o) => IN_PROGRESS.includes(o.status)) ?? null,
    orderAgain: orderAgain.slice(0, 6),
    favorites: favoriteIds.map((id) => byId.get(id)).filter((r): r is R => !!r),
    openNow: restaurants
      .filter((r) => r.is_open)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 6),
  };
}
