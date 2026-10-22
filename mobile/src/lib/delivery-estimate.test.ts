import {
  DEFAULT_PREP_MINUTES,
  TRAVEL_MINUTES,
  deliveryWindow,
  readyClock,
} from "./delivery-estimate";

const PLACED = "2026-10-14T04:00:00.000Z";
const at = (mins: number) => new Date(Date.parse(PLACED) + mins * 60_000).toISOString();

describe("deliveryWindow", () => {
  it("adds prep time and the travel range to when the order was placed", () => {
    const w = deliveryWindow(PLACED, 25, "preparing");
    expect(w?.from.toISOString()).toBe(at(25 + TRAVEL_MINUTES.min));
    expect(w?.to.toISOString()).toBe(at(25 + TRAVEL_MINUTES.max));
  });

  it("falls back to the default prep time for older orders", () => {
    expect(deliveryWindow(PLACED, null, "pending")?.from.toISOString()).toBe(
      at(DEFAULT_PREP_MINUTES + TRAVEL_MINUTES.min)
    );
  });

  it("shows nothing once the order is delivered or cancelled", () => {
    expect(deliveryWindow(PLACED, 20, "delivered")).toBeNull();
    expect(deliveryWindow(PLACED, 20, "cancelled")).toBeNull();
  });

  it("shows nothing for an unreadable placed time", () => {
    expect(deliveryWindow("not a date", 20, "pending")).toBeNull();
  });
});

describe("readyClock", () => {
  it("shows the clock time a stop's food will be ready", () => {
    const clock = readyClock(at(30));
    expect(clock).not.toBeNull();
    expect(clock).toBe(
      new Date(Date.parse(at(30))).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    );
  });

  it("shows nothing when the ready time is missing or unreadable", () => {
    expect(readyClock(null)).toBeNull();
    expect(readyClock(undefined)).toBeNull();
    expect(readyClock("")).toBeNull();
    expect(readyClock("not a date")).toBeNull();
  });
});
