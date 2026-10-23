import { cashOnHandLabel, payoutLine } from "./rider-cash";

// rider-cash imports the Supabase client at module scope; the label itself is
// pure, so the client is stubbed rather than configured.
jest.mock("./supabase", () => ({ supabase: { rpc: jest.fn() } }));

describe("cashOnHandLabel", () => {
  it("reads a settled rider as clear at zero", () => {
    expect(cashOnHandLabel(0)).toEqual({ text: "₱0.00", tone: "clear" });
  });

  it("treats sub-centavo noise as zero rather than a phantom balance", () => {
    expect(cashOnHandLabel(0.004)).toEqual({ text: "₱0.00", tone: "clear" });
    expect(cashOnHandLabel(-0.004)).toEqual({ text: "₱0.00", tone: "clear" });
  });

  it("warns while the rider is still holding collected cash", () => {
    expect(cashOnHandLabel(1250.5)).toEqual({
      text: "₱1250.50",
      tone: "warning",
    });
  });

  it("shows a shortfall as negative and clear", () => {
    // Short is a dispute to settle, not a balance the rider owes today: the
    // warning tone is reserved for cash actually in hand.
    expect(cashOnHandLabel(-45)).toEqual({ text: "-₱45.00", tone: "clear" });
  });

  it("rounds to centavos", () => {
    expect(cashOnHandLabel(1234.567)).toEqual({
      text: "₱1234.57",
      tone: "warning",
    });
  });
});

describe("payoutLine", () => {
  const peso = (n: number) => `₱${n.toFixed(2)}`;
  it("says what is owed, in review, and when the rider was last paid", () => {
    expect(
      payoutLine(
        { owed: 75, inReview: 50, paid: 120, lastPaidAt: "2026-10-20T08:00:00Z" },
        peso
      )
    ).toMatch(/^To be paid ₱75\.00 · ₱50\.00 in review · Last paid /);
    expect(
      payoutLine({ owed: 0, inReview: 0, paid: 0, lastPaidAt: null }, peso)
    ).toBeNull();
  });
});
