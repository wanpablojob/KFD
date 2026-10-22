import { stopsFromReply } from "./pabakal-from-message";

/**
 * `stopsFromReply` reads a reply and never talks to the network. The module it
 * lives in also exports the request helper, which imports the Supabase client;
 * that client throws at import time without env, so it is stubbed here. Jest
 * hoists this call above the import.
 */
jest.mock("./supabase", () => ({ supabase: {} }));

describe("stopsFromReply", () => {
  it("uses the server's stops when it parsed the message", () => {
    const reply = {
      stops: [
        { store: "Mercury", items: [{ name: "Biogesic", quantity: 12 }] },
        { store: "Citi", items: [{ name: "Bulb", quantity: 2 }] },
      ],
    };

    expect(stopsFromReply(reply, "ignored")).toEqual([
      { store: "Mercury", items: [{ name: "Biogesic", quantity: "12" }] },
      { store: "Citi", items: [{ name: "Bulb", quantity: "2" }] },
    ]);
  });

  it("falls back to the phone parser when the server said fallback", () => {
    expect(
      stopsFromReply({ fallback: "no-key" }, "dose ka biogesic sa mercury")
    ).toEqual([{ store: "Mercury", items: [{ name: "biogesic", quantity: "12" }] }]);
  });

  it("falls back when there is no reply at all", () => {
    expect(stopsFromReply(null, "bulb sa citi")).toEqual([
      { store: "Citi", items: [{ name: "bulb", quantity: "1" }] },
    ]);
  });

  it("falls back when the server returned no stops", () => {
    expect(stopsFromReply({ stops: [] }, "bulb sa citi")).toEqual([
      { store: "Citi", items: [{ name: "bulb", quantity: "1" }] },
    ]);
  });

  it("keeps a store the parser could not read blank, for the customer to fill", () => {
    expect(stopsFromReply({ fallback: "malformed" }, "katorse ka biogesic")).toEqual([
      { store: "", items: [{ name: "biogesic", quantity: "14" }] },
    ]);
  });

  it("never returns more than five stores", () => {
    const stops = Array.from({ length: 8 }, (_, i) => ({
      store: `Store ${i}`,
      items: [{ name: "Item", quantity: 1 }],
    }));

    expect(stopsFromReply({ stops }, "x")).toHaveLength(5);
  });

  it("drops a row with no usable items", () => {
    const reply = {
      stops: [
        { store: "Mercury", items: [] },
        { store: "Citi", items: [{ name: "Bulb", quantity: 1 }] },
      ],
    };

    expect(stopsFromReply(reply, "x")).toEqual([
      { store: "Citi", items: [{ name: "Bulb", quantity: "1" }] },
    ]);
  });
});
