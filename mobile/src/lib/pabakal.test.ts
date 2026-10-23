import {
  cleanStops,
  formatLine,
  mergeStops,
  pabakalAmountDue,
  pabakalFee,
  stopsOf,
} from "./pabakal";

jest.mock("./supabase", () => ({ supabase: {} }));

describe("pabakal money", () => {
  it("is due only once the rider has bought, receipt plus both fees", () => {
    expect(
      pabakalAmountDue({ item_cost: null, delivery_fee: 40, pabakal_fee: 20 })
    ).toBeNull();
    expect(
      pabakalAmountDue({ item_cost: 245.5, delivery_fee: 40, pabakal_fee: 30 })
    ).toBe(315.5);
  });

  it("charges 10 per extra store, like a multi-shop trip", () => {
    expect(pabakalFee(1)).toBe(0);
    expect(pabakalFee(3)).toBe(20);
  });
});

describe("cleanStops", () => {
  const item = (name: string, quantity: string) => ({ name, quantity });

  it("drops blank rows and stores, and keeps the rest in order", () => {
    expect(
      cleanStops([
        { store: " Mercury Drug ", items: [item(" Biogesic ", "10"), item("", "")] },
        { store: "", items: [item("", "")] },
        { store: "Citi Hardware", items: [item("Bulb", "2")] },
      ])
    ).toEqual({
      stops: [
        { store: "Mercury Drug", items: [{ name: "Biogesic", quantity: 10 }] },
        { store: "Citi Hardware", items: [{ name: "Bulb", quantity: 2 }] },
      ],
    });
  });

  it("says what to fix", () => {
    expect(cleanStops([{ store: "", items: [item("", "")] }])).toEqual({
      error: "Add a store and what to buy there.",
    });
    expect(cleanStops([{ store: "Shop", items: [item("", "")] }])).toEqual({
      error: "Add what to buy at Shop.",
    });
    expect(
      cleanStops([{ store: "Shop", items: [item("Rice", "1.5")] }])
    ).toHaveProperty("error");
    expect(
      cleanStops([{ store: "Shop", items: [item("Rice", "100")] }])
    ).toHaveProperty("error");
    expect(cleanStops([{ store: "", items: [item("Rice", "1")] }])).toEqual({
      error: "Name each store.",
    });
  });
});

describe("stopsOf", () => {
  it("shows an old single-store row as its free text", () => {
    const [stop] = stopsOf({ stops: [], store: "Mercury", items: "Biogesic x10" });
    expect(stop.store).toBe("Mercury");
    expect(formatLine(stop.items[0])).toBe("Biogesic x10");
    expect(formatLine({ name: "Bulb", quantity: 2 })).toBe("2× Bulb");
  });
});

describe("mergeStops", () => {
  const stop = (store: string, ...names: string[]) => ({
    store,
    items: names.map((name) => ({ name, quantity: "1" })),
  });

  it("adds to a store already on the list, and starts new ones", () => {
    expect(
      mergeStops(
        [stop("Mercury", "Biogesic")],
        [stop("mercury ", "Neozep"), stop("Citi", "Bulb"), stop("", "Itlog")]
      )
    ).toEqual([
      stop("Mercury", "Biogesic", "Neozep"),
      stop("Citi", "Bulb"),
      stop("", "Itlog"),
    ]);
  });

  it("keeps items with no store together, for one store box to fill", () => {
    expect(mergeStops([stop("", "A")], [stop("", "B")])).toEqual([stop("", "A", "B")]);
  });
});
