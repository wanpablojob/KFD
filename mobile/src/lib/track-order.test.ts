import { fetchTrackedOrder } from "./storefront";

jest.mock("./supabase", () => ({
  supabase: { rpc: jest.fn() },
}));

// Same hand-declared require as cart-quote.test.ts: the app tsconfig has no node
// types, and this is the established pattern in the suite.
declare const require: (id: string) => unknown;
const { supabase } = require("./supabase") as {
  supabase: { rpc: jest.Mock };
};
const rpc = supabase.rpc;

describe("fetchTrackedOrder", () => {
  beforeEach(() => rpc.mockReset());

  it("returns null when the reference matches nothing", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await expect(fetchTrackedOrder("KFD-NOPE")).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledWith("track_order", { p_reference: "KFD-NOPE" });
  });

  it("maps the row and parses items, dropping malformed lines", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          reference: "#KFD-1",
          restaurant: "Test Kitchen",
          items: [
            { name: "Adobo", quantity: 2, price: 50 },
            { name: "No quantity" },
            null,
          ],
          subtotal: 100,
          delivery_fee: 45,
          service_fee: 5,
          total: 150,
          status: "preparing",
          payment: "cash",
          placed_at: "2026-10-01T00:00:00Z",
          delivery_address: "123 Rizal St, Kabankalan",
        },
      ],
      error: null,
    });

    await expect(fetchTrackedOrder("KFD-1")).resolves.toEqual({
      reference: "#KFD-1",
      restaurant: "Test Kitchen",
      items: [{ name: "Adobo", quantity: 2, price: 50 }],
      subtotal: 100,
      delivery_fee: 45,
      service_fee: 5,
      total: 150,
      status: "preparing",
      payment: "cash",
      placed_at: "2026-10-01T00:00:00Z",
      delivery_address: "123 Rizal St, Kabankalan",
    });
  });

  it("maps a null delivery address for a non-owner caller", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          reference: "#KFD-2",
          restaurant: "Test Kitchen",
          items: [],
          subtotal: 100,
          delivery_fee: 45,
          service_fee: 5,
          total: 150,
          status: "confirmed",
          payment: "cash",
          placed_at: "2026-10-01T00:00:00Z",
          delivery_address: null,
        },
      ],
      error: null,
    });

    const order = await fetchTrackedOrder("KFD-2");
    expect(order?.delivery_address).toBeNull();
  });

  it("propagates a transport error instead of reporting no order", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("network down") });

    await expect(fetchTrackedOrder("KFD-1")).rejects.toThrow("network down");
  });
});
