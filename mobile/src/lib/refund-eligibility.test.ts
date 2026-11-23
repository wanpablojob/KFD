import { canAskRefund } from "./refund-eligibility";

const now = Date.parse("2026-11-20T12:00:00Z");
const order = {
  status: "delivered",
  payment: "cash",
  placed_at: "2026-11-19T12:00:00Z",
  total: 250,
};

describe("canAskRefund", () => {
  it("allows a recent delivered order that is not fully refunded", () => {
    expect(canAskRefund(order, 0, now)).toBe(true);
    expect(canAskRefund(order, 100, now)).toBe(true);
  });

  it("refuses once fully refunded, or after 7 days", () => {
    expect(canAskRefund(order, 250, now)).toBe(false);
    expect(canAskRefund({ ...order, placed_at: "2026-11-12T11:00:00Z" }, 0, now)).toBe(
      false
    );
  });

  it("allows a cancelled order only when it was paid up front", () => {
    expect(canAskRefund({ ...order, status: "cancelled" }, 0, now)).toBe(false);
    expect(
      canAskRefund({ ...order, status: "cancelled", payment: "e_wallet" }, 0, now)
    ).toBe(true);
  });

  it("refuses an order still on its way", () => {
    expect(canAskRefund({ ...order, status: "on_the_way" }, 0, now)).toBe(false);
  });
});
