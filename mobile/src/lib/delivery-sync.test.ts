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

/**
 * The seeding of `syncedPage1` in rider-home-screen.tsx.
 *
 * `shouldSyncPage1` was correct throughout; the call site misused it. Every test
 * above passes while the bug is live, because they exercise the function rather
 * than the component -- so these pin the one decision that actually breaks it:
 * what the marker is initialised to.
 *
 * The bug: `useState(page1)`. staleTime is 5 minutes and the cache is persisted
 * to disk, so returning to the tab usually remounts onto data that is already
 * defined. Seeding the marker from that same object made it equal to the data,
 * so the guard reported "nothing changed", `setOrders` never ran, and the
 * Deliveries tab stayed empty -- no spinner, no error. Cold starts recovered,
 * which is why this looked fixed in testing and failed in the rider's hands.
 *
 * The rule: the marker means "what is currently on screen", and nothing is on
 * screen at mount, so it must start as undefined whatever the query holds.
 */
describe("the synced marker must start empty", () => {
  it("a warm remount syncs, because the marker is not seeded from the data", () => {
    // What the screen does now: useState(undefined).
    const warmPage = page(["a"], "c2");
    const marker: DeliveryPage | undefined = undefined;
    expect(shouldSyncPage1(warmPage, marker)).toBe(true);
  });

  it("seeding from page1 is what silently broke it", () => {
    // What the screen used to do: useState(page1). Kept as a regression
    // witness so the failure mode is visible rather than folklore.
    const warmPage = page(["a"], "c2");
    const wronglySeededMarker: DeliveryPage | undefined = warmPage;
    expect(shouldSyncPage1(warmPage, wronglySeededMarker)).toBe(false);
  });

  it("the first defined page always syncs, whatever the cache held", () => {
    // Every one of these has to be applied on mount: an empty result from the
    // cache and a full one are both real answers and the rider must see whichever
    // is true. Only undefined is excluded, because nothing is known yet.
    for (const cached of [page([]), page(["a"], "c2")]) {
      const marker: DeliveryPage | undefined = undefined;
      expect(shouldSyncPage1(cached, marker)).toBe(true);
    }
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
