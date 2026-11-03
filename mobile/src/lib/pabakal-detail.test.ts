import { pabakalSize, pabakalTimeline } from "./pabakal";

jest.mock("./supabase", () => ({ supabase: {} }));
jest.mock("./admin-api", () => ({ postApi: jest.fn() }));

const base = {
  created_at: "2026-11-03T01:00:00Z",
  accepted_at: null,
  bought_at: null,
  delivered_at: null,
  cancelled_at: null,
};

describe("pabakal detail", () => {
  it("counts stores and items, quantities included", () => {
    expect(
      pabakalSize({
        store: "Mercury",
        items: "",
        stops: [
          { store: "Mercury", items: [{ name: "Biogesic", quantity: 2 }] },
          { store: "7-Eleven", items: [{ name: "Bear Brand", quantity: 1 }] },
        ],
      })
    ).toBe("2 stores · 3 items");
    // A 0120 row: one free-text line.
    expect(pabakalSize({ store: "Citi", items: "bulb", stops: [] })).toBe(
      "1 store · 1 item"
    );
  });

  it("lists every step, with times only for the ones reached", () => {
    const steps = pabakalTimeline({
      ...base,
      status: "accepted",
      accepted_at: "2026-11-03T01:05:00Z",
    });
    expect(steps.map((s) => [s.label, s.at !== null])).toEqual([
      ["Requested", true],
      ["Rider accepted", true],
      ["Bought, on the way", false],
      ["Delivered", false],
    ]);
  });

  it("ends a cancelled pabakal at Cancelled", () => {
    const steps = pabakalTimeline({
      ...base,
      status: "cancelled",
      cancelled_at: "2026-11-03T01:09:00Z",
    });
    expect(steps.map((s) => s.label)).toEqual(["Requested", "Cancelled"]);
  });
});
