import { mergeOrderPages, shouldSyncPage1, type DeliveryPage } from "./delivery-sync";

function page(ids: string[], nextCursor: string | null = null): DeliveryPage {
  return {
    items: ids.map((id) => ({
      id,
      reference: `#KFD-${id}`,
      customer: "Test Customer",
      customer_phone: null,
      restaurant: "Test Kitchen",
      delivery_address: "Gate 2",
      items: [],
      total: 100,
      rider_payout: 25,
      status: "confirmed",
      payment: "cash",
      placed_at: "2026-10-01T00:00:00Z",
      next_cursor: nextCursor,
    })),
    nextCursor,
  };
}

describe("shouldSyncPage1", () => {
  it("syncs a defined page that differs from the last one", () => {
    expect(shouldSyncPage1(page(["a"]), undefined)).toBe(true);
  });

  it("does not sync the identical page object twice", () => {
    const p = page(["a"]);
    expect(shouldSyncPage1(p, p)).toBe(false);
  });

  it("does not sync when the query is undefined", () => {
    // The regression. Coming back from another tab remounts the screen, the
    // query goes pending and data is undefined for a moment. Syncing here is
    // what emptied the rider's deliveries.
    expect(shouldSyncPage1(undefined, page(["a"]))).toBe(false);
  });

  it("does not sync undefined on a first load either", () => {
    expect(shouldSyncPage1(undefined, undefined)).toBe(false);
  });

  it("syncs again once real data arrives after an undefined gap", () => {
    const first = page(["a"]);
    expect(shouldSyncPage1(undefined, first)).toBe(false);
    expect(shouldSyncPage1(first, first)).toBe(false);
    const second = page(["a", "b"]);
    expect(shouldSyncPage1(second, first)).toBe(true);
  });

  it("syncs a genuinely empty result", () => {
    // Empty is a real answer from the server and must be shown. Only undefined
    // means "unknown".
    expect(shouldSyncPage1(page([]), page(["a"]))).toBe(true);
  });

  it("distinguishes two different empty results by identity", () => {
    // Two distinct objects both meaning "empty" -- identity decides, which is
    // what the render-phase compare does too.
    expect(shouldSyncPage1(page([]), page([]))).toBe(true);
  });

  it("treats a page with a next cursor as different from one without", () => {
    expect(shouldSyncPage1(page(["a"], "cursor-1"), page(["a"]))).toBe(true);
  });
});

describe("mergeOrderPages", () => {
  const row = (id: string) => ({ id, reference: `#KFD-${id}` });

  it("appends a page that shares no orders", () => {
    expect(mergeOrderPages([row("a")], [row("b"), row("c")]).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("drops an order that is already on screen", () => {
    // The overlap that happens when an order changes status between the page-1
    // fetch and a later page fetch.
    expect(
      mergeOrderPages([row("a"), row("b")], [row("b"), row("c")]).map((r) => r.id)
    ).toEqual(["a", "b", "c"]);
  });

  it("keeps the copy already on screen when the same id arrives again", () => {
    const existing = [{ id: "a", reference: "old" }];
    const incoming = [{ id: "a", reference: "new" }];
    expect(mergeOrderPages(existing, incoming)[0].reference).toBe("old");
  });

  it("does not duplicate when the whole page is a repeat", () => {
    expect(mergeOrderPages([row("a"), row("b")], [row("a"), row("b")]).length).toBe(2);
  });

  it("returns the existing list when the page is empty", () => {
    expect(mergeOrderPages([row("a")], []).map((r) => r.id)).toEqual(["a"]);
  });

  it("does not mutate the existing array", () => {
    const existing = [row("a")];
    mergeOrderPages(existing, [row("b")]);
    expect(existing.length).toBe(1);
  });
});
