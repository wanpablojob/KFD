import { ratingTargetFor } from "./rating-target";

const o = (id: string, reference: string, status = "delivered") => ({
  id,
  reference,
  status,
});

describe("ratingTargetFor", () => {
  const entries = [
    { trip: { reference: "TRP-1" }, parts: [o("a", "ORD-A"), o("b", "ORD-B")] },
    { trip: null, parts: [o("c", "ORD-C", "preparing")] },
  ];

  it("opens a trip's first unrated delivered shop order", () => {
    expect(ratingTargetFor(entries, new Set(), "trp-1")?.id).toBe("a");
    expect(ratingTargetFor(entries, new Set(["a"]), "TRP-1")?.id).toBe("b");
  });

  it("prefers the shop order the reference names", () => {
    expect(ratingTargetFor(entries, new Set(), "ORD-B")?.id).toBe("b");
  });

  it("opens nothing when all are rated, undelivered, or unknown", () => {
    expect(ratingTargetFor(entries, new Set(["a", "b"]), "TRP-1")).toBeNull();
    expect(ratingTargetFor(entries, new Set(), "ORD-C")).toBeNull();
    expect(ratingTargetFor(entries, new Set(), "NOPE")).toBeNull();
  });
});
