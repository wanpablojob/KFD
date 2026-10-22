import { pabakalAmountDue, parseBudget } from "./pabakal";

jest.mock("./supabase", () => ({ supabase: {} }));

describe("pabakal money", () => {
  it("is due only once the rider has bought, receipt plus both fees", () => {
    expect(
      pabakalAmountDue({ item_cost: null, delivery_fee: 40, pabakal_fee: 20 })
    ).toBeNull();
    expect(
      pabakalAmountDue({ item_cost: 245.5, delivery_fee: 40, pabakal_fee: 20 })
    ).toBe(305.5);
  });

  it("takes a budget within the cap and refuses junk", () => {
    expect(parseBudget(" 300 ")).toEqual({ value: 300 });
    expect(parseBudget("99.999")).toEqual({ value: 100 });
    expect(parseBudget("")).toHaveProperty("error");
    expect(parseBudget("-5")).toHaveProperty("error");
    expect(parseBudget("2000.01")).toHaveProperty("error");
  });
});
