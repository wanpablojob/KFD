import { landingFor } from "./session-landing";

describe("landingFor", () => {
  it("sends a customer from the tracker, the landing or sign-in to home", () => {
    expect(landingFor("customer", "/track")).toBe("/customer");
    expect(landingFor("customer", "/")).toBe("/customer");
    expect(landingFor("customer", "/login")).toBe("/customer");
  });

  it("leaves people where they are inside their own area", () => {
    expect(landingFor("customer", "/customer")).toBeNull();
    expect(landingFor("customer", "/customer/restaurant")).toBeNull();
    expect(landingFor("customer", "/rider-apply")).toBeNull();
    expect(landingFor("rider", "/rider/earnings")).toBeNull();
    expect(landingFor("merchant", "/notifications")).toBeNull();
  });

  it("knows each role's home, and does not mistake a prefix", () => {
    expect(landingFor("rider", "/track")).toBe("/rider");
    expect(landingFor("merchant", "/customer")).toBe("/merchant");
    expect(landingFor("admin", "/track")).toBe("/account");
    expect(landingFor("rider", "/rider-apply")).toBe("/rider");
  });
});
