import { fetchOrderFees, quoteOrder } from "./storefront";

// Jest runs in Node but the app's tsconfig has no node types, and a source scan
// is worth more here than a devDependency. Typed by hand rather than as any.
declare const require: (id: string) => unknown;
declare const __dirname: string;

const { readFileSync } = require("fs") as {
  readFileSync: (path: string, encoding: "utf8") => string;
};
const { join } = require("path") as {
  join: (...parts: string[]) => string;
};

jest.mock("./supabase", () => ({
  supabase: { rpc: jest.fn() },
}));

const { supabase } = require("./supabase") as {
  supabase: { rpc: jest.Mock };
};
const rpc = supabase.rpc;
const read = (name: string) => readFileSync(join(__dirname, name), "utf8");

const CART = {
  restaurantId: "r1",
  items: [{ menu_item_id: "m1", quantity: 2 }],
};

describe("quoteOrder", () => {
  beforeEach(() => rpc.mockReset());

  it("sends the cart and returns the server's own numbers", async () => {
    rpc.mockResolvedValue({
      data: [{ subtotal: 200, delivery_fee: 45, service_fee: 5, total: 250 }],
      error: null,
    });

    const quote = await quoteOrder(CART);

    expect(rpc).toHaveBeenCalledWith("quote_order", {
      p_restaurant_id: "r1",
      p_items: CART.items,
    });
    expect(quote).toEqual({
      subtotal: 200,
      delivery_fee: 45,
      service_fee: 5,
      total: 250,
    });
  });

  it("passes through the server's rejection rather than inventing a total", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: new Error("One or more items are no longer available."),
    });

    await expect(quoteOrder(CART)).rejects.toThrow(/no longer available/);
  });

  it("refuses to guess when the server answers with an unexpected shape", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(quoteOrder(CART)).rejects.toThrow(/Could not price this cart/);
  });
});

describe("fetchOrderFees", () => {
  beforeEach(() => rpc.mockReset());

  it("reads the fees instead of the app knowing them", async () => {
    rpc.mockResolvedValue({
      data: [{ delivery_fee: 45, service_fee: 5 }],
      error: null,
    });
    await expect(fetchOrderFees()).resolves.toEqual({
      delivery_fee: 45,
      service_fee: 5,
    });
    expect(rpc).toHaveBeenCalledWith("order_fees");
  });
});

/**
 * The regression this whole change exists to prevent. The client used to carry
 * DELIVERY_FEE = 45 / SERVICE_FEE = 5 copied out of the SQL, in three places,
 * and a test that asserted the copies matched. Asserting on source text is the
 * blunt instrument on purpose: it fails the moment someone re-adds a fee, which
 * is exactly the failure being guarded against.
 */
describe("the client holds no fees of its own", () => {
  // cart-logic.ts is here because it used to carry DELIVERY_FEE/SERVICE_FEE
  // alongside the line maths. It has no business pricing anything now.
  const sources = [
    "cart-logic.ts",
    "cart-quote.ts",
    "storefront.ts",
    "../app/customer/cart.tsx",
    "../app/customer/index.tsx",
  ];

  it.each(sources)("%s declares no delivery or service fee", (name) => {
    expect(read(name)).not.toMatch(/DELIVERY_FEE|SERVICE_FEE/);
  });

  it.each(sources)("%s hardcodes no peso fee amount", (name) => {
    expect(read(name)).not.toMatch(/₱\s?45|₱\s?5(\.00)?\b/);
  });

  it("replaces the client total with the server quote", () => {
    const cart = read("../app/customer/cart.tsx");
    // No local arithmetic: the displayed figures must come off the quote.
    expect(cart).not.toMatch(/subtotal\s*\+/);
    expect(cart).toMatch(/quote\?\.total/);
  });
});
