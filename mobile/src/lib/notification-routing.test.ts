import {
  isRoleSettled,
  pathForRoute,
  routeForNotification,
} from "./notification-routing";

describe("isRoleSettled", () => {
  const base = {
    sessionLoading: false,
    user: { id: "u1" },
    role: "rider" as const,
    roleError: false,
  };

  it("is settled once a rider role is known", () => {
    expect(isRoleSettled(base)).toBe(true);
  });

  it("is not settled while the session is loading", () => {
    expect(isRoleSettled({ ...base, sessionLoading: true })).toBe(false);
  });

  it("is not settled for a signed-in user with no role yet", () => {
    expect(isRoleSettled({ ...base, role: null })).toBe(false);
  });

  it("is settled for a signed-out user", () => {
    expect(isRoleSettled({ ...base, user: null, role: null })).toBe(true);
  });

  it("is settled when the role failed, so a cold-start tap does not hang forever", () => {
    expect(isRoleSettled({ ...base, role: null, roleError: true })).toBe(true);
  });
});

describe("routeForNotification", () => {
  it("routes a dispatch offer to the rider's offers tab", () => {
    expect(
      routeForNotification({ type: "dispatch_offer", orderId: "o1" }, "rider")
    ).toEqual({ kind: "rider-offers" });
  });

  it("routes a delivery alert to the rider's home tab", () => {
    expect(
      routeForNotification({ type: "delivery_completed", orderId: "o1" }, "rider")
    ).toEqual({ kind: "rider-home" });
  });

  it("routes a pabakal update to the customer's Pabakal tab", () => {
    expect(routeForNotification({ type: "pabakal_status" }, "customer")).toEqual({
      kind: "customer-pabakal",
    });
    expect(pathForRoute({ kind: "customer-pabakal" })).toBe("/customer/pabakal");
  });

  it("routes a new pabakal to the rider's Available tab", () => {
    expect(routeForNotification({ type: "pabakal_offer" }, "rider")).toEqual({
      kind: "rider-offers",
    });
  });

  it("routes a cancellation to the rider's home tab, not the public tracker", () => {
    expect(
      routeForNotification({ type: "order_cancelled", reference: "#KFD-1" }, "rider")
    ).toEqual({ kind: "rider-home" });
  });

  it("ignores a dispatch offer for a signed-in customer", () => {
    expect(routeForNotification({ type: "dispatch_offer" }, "customer")).toBeNull();
  });

  it("ignores a dispatch offer for a signed-out user", () => {
    expect(routeForNotification({ type: "dispatch_offer" }, null)).toBeNull();
  });

  it("ignores a delivery alert for a merchant", () => {
    expect(routeForNotification({ type: "delivery_completed" }, "merchant")).toBeNull();
  });

  it("keeps reference-only pushes on the public tracker", () => {
    expect(routeForNotification({ reference: "KFD-1042" }, null)).toEqual({
      kind: "track",
      reference: "KFD-1042",
    });
    expect(routeForNotification({ reference: "KFD-1042" }, "customer")).toEqual({
      kind: "track",
      reference: "KFD-1042",
    });
  });

  it("opens a merchant's Orders tab for an order alert", () => {
    const route = routeForNotification({ reference: "KFD-1042" }, "merchant");
    expect(route).toEqual({ kind: "merchant-orders" });
    expect(pathForRoute(route!)).toBe("/merchant");
  });

  it("prefers the typed route when a payload carries both a type and a reference", () => {
    // The offer payload includes orderId, and a future one might add a reference
    // for the customer's tracker. The rider screen is the more specific intent.
    expect(
      routeForNotification({ type: "dispatch_offer", reference: "KFD-1" }, "rider")
    ).toEqual({ kind: "rider-offers" });
  });

  it("returns null for an unknown type with no reference", () => {
    expect(routeForNotification({ type: "something_else" }, "rider")).toBeNull();
  });

  it("returns null for an empty payload, a null payload and a non-object", () => {
    expect(routeForNotification({}, "rider")).toBeNull();
    expect(routeForNotification(null, "rider")).toBeNull();
    expect(routeForNotification("nope", "rider")).toBeNull();
  });

  it("ignores a blank reference rather than routing to /track?ref=", () => {
    expect(routeForNotification({ reference: "   " }, "customer")).toBeNull();
  });

  it("ignores a non-string type instead of trusting it", () => {
    expect(routeForNotification({ type: 7, reference: "KFD-9" }, "rider")).toEqual({
      kind: "track",
      reference: "KFD-9",
    });
  });
});

describe("pathForRoute", () => {
  it("builds the offers path", () => {
    expect(pathForRoute({ kind: "rider-offers" })).toBe("/rider/offers");
  });

  it("builds the rider home path", () => {
    expect(pathForRoute({ kind: "rider-home" })).toBe("/rider");
  });

  it("encodes the reference so it cannot break out of the query string", () => {
    expect(pathForRoute({ kind: "track", reference: "KFD 1&x=2" })).toBe(
      "/track?ref=KFD%201%26x%3D2"
    );
  });
});
