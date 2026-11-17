import { isReadyForPickup, READY_LABEL, statusLabel } from "./order-status";

const LABELS = { preparing: "Being prepared", out_for_delivery: "On the way" };

describe("order status labels", () => {
  it("shows Ready for pickup only for a preparing order the shop marked ready", () => {
    expect(isReadyForPickup("preparing", "2026-11-17T10:00:00Z")).toBe(true);
    expect(isReadyForPickup("preparing", null)).toBe(false);
    // Once the rider has it, it is on the way, whatever the shop said earlier.
    expect(isReadyForPickup("out_for_delivery", "2026-11-17T10:00:00Z")).toBe(false);
  });

  it("falls back to the screen's own label otherwise", () => {
    expect(statusLabel(LABELS, "preparing", "2026-11-17T10:00:00Z")).toBe(READY_LABEL);
    expect(statusLabel(LABELS, "preparing", null)).toBe("Being prepared");
    expect(statusLabel(LABELS, "out_for_delivery", "2026-11-17T10:00:00Z")).toBe(
      "On the way"
    );
    expect(statusLabel(LABELS, "something_new", null)).toBe("something_new");
  });
});
