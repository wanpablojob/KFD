/* eslint-disable import/first -- jest.mock is hoisted above imports by design. */
// The file under test imports the Supabase client, which builds at import time
// and throws without env. The mappers are the only thing exercised here.
jest.mock("./supabase", () => ({ supabase: {} }));

import { mapMyOrderRow, mapRiderOfferRow, mapRiderOrderRow } from "./storefront";

/**
 * Every row here is a shape PostgREST actually returns, including the nullable
 * columns gen-types claims are non-null. If a mapper starts passing those
 * through, the rider or customer sees the string "null".
 */

describe("mapRiderOrderRow", () => {
  const base = {
    id: "o1",
    reference: "KFD-001",
    customer: "Ana",
    restaurant: "KFD Kitchen",
    items: [{ name: "Adobo", quantity: 2, price: 120 }],
    total: 330,
    status: "out_for_delivery",
    payment: "cash",
    placed_at: "2026-10-20T10:00:00Z",
  };

  it("maps a full row", () => {
    expect(
      mapRiderOrderRow({
        ...base,
        customer_phone: "09171234567",
        delivery_address: "12 Mabini St",
        rider_payout: 45,
        next_cursor: "2026-10-20T10:00:00Z",
      })
    ).toEqual({
      ...base,
      customer_phone: "09171234567",
      delivery_address: "12 Mabini St",
      rider_payout: 45,
      next_cursor: "2026-10-20T10:00:00Z",
    });
  });

  it("turns every nullable column into a real null", () => {
    const row = mapRiderOrderRow({
      ...base,
      customer_phone: null,
      delivery_address: null,
      rider_payout: null,
      next_cursor: null,
    });
    expect(row.customer_phone).toBeNull();
    expect(row.delivery_address).toBeNull();
    expect(row.rider_payout).toBeNull();
    expect(row.next_cursor).toBeNull();
  });

  it("drops garbage item entries instead of rendering them", () => {
    const row = mapRiderOrderRow({
      ...base,
      items: [{ name: "Adobo", quantity: 1, price: 120 }, null, "x", { name: 3 }],
    });
    expect(row.items).toEqual([{ name: "Adobo", quantity: 1, price: 120 }]);
  });
});

describe("mapRiderOfferRow", () => {
  it("maps nullables and leaves the payout absent when the order lost it", () => {
    const row = mapRiderOfferRow({
      offer_id: 7,
      order_id: "o1",
      reference: "KFD-001",
      restaurant: "KFD Kitchen",
      customer: "Ana",
      delivery_address: null,
      items: [],
      total: 330,
      order_status: "pending",
      payout_per_delivery: null,
      city: null,
      offered_at: "2026-10-20T10:00:00Z",
      expires_at: "2026-10-20T10:05:00Z",
    });

    expect(row.offerId).toBe(7);
    expect(row.deliveryAddress).toBeNull();
    expect(row.payoutPerDelivery).toBeNull();
    expect(row.city).toBeNull();
    expect(row.items).toEqual([]);
  });
});

describe("mapMyOrderRow", () => {
  it("keeps the nullable columns nullable and survives a missing item list", () => {
    const row = mapMyOrderRow({
      id: "o1",
      reference: "KFD-001",
      restaurant: "KFD Kitchen",
      restaurant_id: null,
      rider_id: null,
      items: null,
      subtotal: 120,
      delivery_fee: 30,
      service_fee: 10,
      total: 160,
      status: "delivered",
      payment: "cash",
      placed_at: "2026-10-20T10:00:00Z",
      delivery_address: null,
    });

    expect(row.restaurant_id).toBeNull();
    expect(row.rider_id).toBeNull();
    expect(row.delivery_address).toBeNull();
    expect(row.items).toEqual([]);
    expect(row.total).toBe(160);
  });
});
