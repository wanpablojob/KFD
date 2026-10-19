import {
  itemSummary,
  merchantNextStatuses,
  minutesWaiting,
  salesTotals,
  todayCounts,
} from "./merchant-logic";

const NOW = new Date(2026, 9, 20, 12, 0);
const daysAgo = (d: number, h = 10) => new Date(2026, 9, 20 - d, h).toISOString();

describe("merchantNextStatuses", () => {
  it("matches the transitions the database allows a merchant", () => {
    expect(merchantNextStatuses("pending")).toEqual(["confirmed", "cancelled"]);
    expect(merchantNextStatuses("confirmed")).toEqual(["preparing", "cancelled"]);
    expect(merchantNextStatuses("preparing")).toEqual(["cancelled"]);
    expect(merchantNextStatuses("out_for_delivery")).toEqual([]);
  });
});

describe("minutesWaiting and itemSummary", () => {
  it("rounds down, never negative, and lists what to cook", () => {
    expect(
      minutesWaiting(new Date(NOW.getTime() - 8.5 * 60000).toISOString(), NOW)
    ).toBe(8);
    expect(minutesWaiting(new Date(NOW.getTime() + 60000).toISOString(), NOW)).toBe(0);
    expect(
      itemSummary([
        { name: "Inasal", quantity: 2 },
        { name: "Rice", quantity: 1 },
      ])
    ).toBe("2× Inasal, 1× Rice");
  });
});

describe("salesTotals", () => {
  it("counts delivered food subtotal net of refunds per window", () => {
    const totals = salesTotals(
      [
        { id: "a", placedAt: daysAgo(0), status: "delivered", subtotal: 100 },
        { id: "b", placedAt: daysAgo(3), status: "delivered", subtotal: 200 },
        { id: "c", placedAt: daysAgo(20), status: "delivered", subtotal: 50 },
        { id: "d", placedAt: daysAgo(0), status: "cancelled", subtotal: 999 },
        { id: "e", placedAt: daysAgo(40), status: "delivered", subtotal: 999 },
      ],
      new Map([["b", 30]]),
      NOW
    );
    expect(totals).toEqual({
      today: { orders: 1, sales: 100 },
      week: { orders: 2, sales: 270 },
      month: { orders: 3, sales: 320 },
    });
  });

  it("never lets a refund larger than the food push sales negative", () => {
    const totals = salesTotals(
      [{ id: "a", placedAt: daysAgo(0), status: "delivered", subtotal: 80 }],
      new Map([["a", 135]]),
      NOW
    );
    expect(totals.today.sales).toBe(0);
  });
});

describe("todayCounts", () => {
  it("counts pending and today's non-cancelled orders", () => {
    expect(
      todayCounts(
        [
          { placedAt: daysAgo(0), status: "pending" },
          { placedAt: daysAgo(0), status: "cancelled" },
          { placedAt: daysAgo(1), status: "delivered" },
        ],
        NOW
      )
    ).toEqual({ pending: 1, today: 1 });
  });
});
