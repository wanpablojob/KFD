import { homeSections } from "./customer-home";

const r = (id: string, is_open = true, rating = 4) => ({ id, is_open, rating });
const o = (ref: string, restaurant_id: string | null, status: string, day: number) => ({
  reference: ref,
  restaurant_id,
  status,
  placed_at: new Date(2026, 9, day).toISOString(),
});

describe("homeSections", () => {
  const restaurants = [r("a", true, 4.2), r("b", false, 4.9), r("c", true, 4.8)];

  it("picks the newest order still in progress", () => {
    const s = homeSections(
      [
        o("old", "a", "pending", 1),
        o("new", "c", "out_for_delivery", 3),
        o("done", "a", "delivered", 4),
      ],
      restaurants,
      []
    );
    expect(s.activeOrder?.reference).toBe("new");
  });

  it("lists past kitchens newest first, once each, delivered only, still listed", () => {
    const s = homeSections(
      [
        o("1", "a", "delivered", 1),
        o("2", "c", "delivered", 2),
        o("3", "a", "delivered", 3),
        o("4", "b", "cancelled", 4),
        o("5", "gone", "delivered", 5),
      ],
      restaurants,
      []
    );
    expect(s.orderAgain.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("keeps favourite order, drops unknown ids, and ranks open kitchens by rating", () => {
    const s = homeSections([], restaurants, ["c", "missing", "a"]);
    expect(s.favorites.map((x) => x.id)).toEqual(["c", "a"]);
    expect(s.openNow.map((x) => x.id)).toEqual(["c", "a"]);
    expect(s.activeOrder).toBeNull();
  });
});
