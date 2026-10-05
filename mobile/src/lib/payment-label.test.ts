import { isCashPayment, paymentLabel } from "./payment-label";

describe("paymentLabel", () => {
  it("names cash as cash on delivery", () => {
    expect(paymentLabel("cash")).toBe("Cash on delivery");
  });

  it("names e-wallet and card as methods, without claiming they were paid", () => {
    // There is no settled flag anywhere in the schema, so "Paid by card" would
    // be a guess, and the one a rider might act on.
    expect(paymentLabel("e_wallet")).toBe("e-wallet");
    expect(paymentLabel("card")).toBe("card");
    expect(paymentLabel("card")).not.toMatch(/paid/i);
    expect(paymentLabel("e_wallet")).not.toMatch(/paid/i);
  });

  it("shows an unknown method as itself rather than blank", () => {
    expect(paymentLabel("bank_transfer")).toBe("bank_transfer");
  });
});

describe("isCashPayment", () => {
  it("is true only for cash", () => {
    expect(isCashPayment("cash")).toBe(true);
    expect(isCashPayment("e_wallet")).toBe(false);
    expect(isCashPayment("card")).toBe(false);
  });
});
