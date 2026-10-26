import { storefrontEmptyState, type StorefrontEmptyArgs } from "./storefront-empty";

function state(overrides: Partial<StorefrontEmptyArgs> = {}) {
  return storefrontEmptyState({
    isLoading: false,
    isError: false,
    catalogueCount: 5,
    resultCount: 5,
    filtersActive: false,
    ...overrides,
  });
}

describe("storefrontEmptyState", () => {
  it("says nothing when there are results", () => {
    expect(state()).toBeNull();
  });

  it("shows loading while the first fetch is in flight", () => {
    expect(state({ isLoading: true, resultCount: 0 })).toBe("loading");
  });

  it("prefers loading over everything else so the header stays mounted", () => {
    expect(
      state({ isLoading: true, isError: true, catalogueCount: 0, resultCount: 0 })
    ).toBe("loading");
  });

  it("shows an error state when the fetch failed", () => {
    expect(state({ isError: true, resultCount: 0 })).toBe("error");
  });

  it("says no places are open only when the whole catalogue is empty", () => {
    expect(state({ catalogueCount: 0, resultCount: 0 })).toBe("no_places");
  });

  it("distinguishes a search that matched nothing from a closed catalogue", () => {
    // The regression: 5 restaurants exist, the query matched 0. The old code
    // keyed off the (now empty) chip list and claimed the catalogue was closed.
    expect(state({ catalogueCount: 5, resultCount: 0, filtersActive: true })).toBe(
      "no_match"
    );
  });

  it("treats an empty unfiltered result as no places, not a bad filter", () => {
    expect(state({ catalogueCount: 5, resultCount: 0, filtersActive: false })).toBe(
      "no_places"
    );
  });

  it("stays quiet when the query only matched dishes", () => {
    // "baboy" is a menu item at Habhab, not a shop name or a cuisine: the shop
    // list is empty, the dish list is not, and the screen must not claim there
    // was no match while the match sits above it.
    expect(
      state({ catalogueCount: 5, resultCount: 0, filtersActive: true, dishCount: 2 })
    ).toBeNull();
  });

  it("still reports a miss when neither shops nor dishes matched", () => {
    expect(
      state({ catalogueCount: 5, resultCount: 0, filtersActive: true, dishCount: 0 })
    ).toBe("no_match");
  });
});
