import {
  allTimeTotals,
  formatClock,
  parseClock,
  itemSummary,
  ordersInWindow,
  parsePrice,
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

describe("parsePrice", () => {
  it("accepts pesos and centavos, refuses junk and negatives", () => {
    expect(parsePrice("120")).toBe(120);
    expect(parsePrice(" 99.999 ")).toBe(100);
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("abc")).toBeNull();
    expect(parsePrice("-5")).toBeNull();
  });
});

describe("ordersInWindow", () => {
  it("lists every status placed in the window, newest first", () => {
    const rows = ordersInWindow(
      [
        { id: "old", placedAt: daysAgo(1), status: "delivered" },
        { id: "a", placedAt: daysAgo(0, 9), status: "cancelled" },
        { id: "b", placedAt: daysAgo(0, 11), status: "delivered" },
      ],
      "today",
      NOW
    );
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
    expect(ordersInWindow([{ placedAt: daysAgo(6) }], "week", NOW)).toHaveLength(1);
    expect(ordersInWindow([{ placedAt: daysAgo(7) }], "week", NOW)).toHaveLength(0);
  });
});

describe("allTimeTotals", () => {
  it("sums delivered food net of refunds, capped per order", () => {
    expect(
      allTimeTotals(
        [
          { id: "a", subtotal: 100 },
          { id: "b", subtotal: 50 },
        ],
        new Map([
          ["a", 20],
          ["b", 999],
        ])
      )
    ).toEqual({ orders: 2, sales: 80 });
  });
});

describe("parseClock and formatClock", () => {
  it("reads the ways a merchant types a time", () => {
    expect(parseClock("8")).toBe("08:00");
    expect(parseClock("8:30")).toBe("08:30");
    expect(parseClock("20:00")).toBe("20:00");
    expect(parseClock("8am")).toBe("08:00");
    expect(parseClock("8:30 pm")).toBe("20:30");
    expect(parseClock("12 am")).toBe("00:00");
    expect(parseClock("12pm")).toBe("12:00");
    expect(parseClock("25:00")).toBeNull();
    expect(parseClock("8:75")).toBeNull();
    expect(parseClock("noon")).toBeNull();
  });

  it("shows a time the way people say it", () => {
    expect(formatClock("20:00:00")).toBe("8:00 PM");
    expect(formatClock("00:30")).toBe("12:30 AM");
    expect(formatClock("12:00")).toBe("12:00 PM");
  });
});
