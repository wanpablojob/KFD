import { ORDER_PROGRESS, isTerminalStatus, orderProgress } from "./order-progress";

describe("isTerminalStatus", () => {
  it.each(["delivered", "cancelled"])("treats %s as terminal", (status) => {
    expect(isTerminalStatus(status)).toBe(true);
  });

  it.each(["pending", "confirmed", "preparing", "out_for_delivery"])(
    "treats %s as still live",
    (status) => {
      expect(isTerminalStatus(status)).toBe(false);
    }
  );

  it("does not treat an unknown status as terminal", () => {
    // Erring toward polling is safer: a stuck tracker is worse than one extra
    // request, and an unknown status is not evidence the order is finished.
    expect(isTerminalStatus("something_new")).toBe(false);
  });
});

describe("orderProgress", () => {
  it("covers every non-cancelled status", () => {
    expect(ORDER_PROGRESS.map((s) => s.status)).toEqual([
      "pending",
      "confirmed",
      "preparing",
      "out_for_delivery",
      "delivered",
    ]);
  });

  it("marks the first step current on a fresh order", () => {
    const steps = orderProgress("pending");
    expect(steps[0].state).toBe("current");
    expect(steps.slice(1).every((s) => s.state === "upcoming")).toBe(true);
  });

  it("marks earlier steps done and later steps upcoming", () => {
    const steps = orderProgress("preparing");
    expect(steps.map((s) => s.state)).toEqual([
      "done",
      "done",
      "current",
      "upcoming",
      "upcoming",
    ]);
  });

  it("marks the final step current (and the rest done) when delivered", () => {
    const steps = orderProgress("delivered");
    expect(steps.map((s) => s.state)).toEqual([
      "done",
      "done",
      "done",
      "done",
      "current",
    ]);
  });

  it("returns no progression for a cancelled order", () => {
    expect(orderProgress("cancelled")).toEqual([]);
  });

  it("falls back to the first step for an unknown status", () => {
    const steps = orderProgress("something_new");
    expect(steps[0].state).toBe("current");
  });
});
