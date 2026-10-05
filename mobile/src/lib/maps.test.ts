import { mapsUrl } from "./maps";

describe("mapsUrl", () => {
  it("builds a geo: query on Android", () => {
    expect(mapsUrl("12 Rizal St, Kabankalan", "android")).toBe(
      "geo:0,0?q=" + encodeURIComponent("12 Rizal St, Kabankalan")
    );
  });

  it("builds a maps: query on iOS", () => {
    expect(mapsUrl("12 Rizal St, Kabankalan", "ios")).toBe(
      "maps:?q=" + encodeURIComponent("12 Rizal St, Kabankalan")
    );
  });

  it("falls back to a Google Maps URL elsewhere", () => {
    expect(mapsUrl("12 Rizal St", "web")).toContain("google.com/maps");
  });

  it("encodes characters that would otherwise break the query", () => {
    const url = mapsUrl("Blk 3 Lot 4 & 5, Brgy. 1", "android");
    expect(url).not.toContain(" ");
    expect(url).not.toContain("&5");
    expect(url).toContain(encodeURIComponent("&"));
  });

  it("returns null for a missing address", () => {
    expect(mapsUrl(null, "android")).toBeNull();
  });

  it("returns null for a blank or whitespace address", () => {
    expect(mapsUrl("", "ios")).toBeNull();
    expect(mapsUrl("   ", "ios")).toBeNull();
  });

  it("returns null for something too short to be an address", () => {
    // Guards against a stray "N/A" or "." rendering a button that goes nowhere.
    expect(mapsUrl("NA", "android")).toBeNull();
  });

  it("trims before encoding", () => {
    expect(mapsUrl("  Main St  ", "android")).toBe(
      "geo:0,0?q=" + encodeURIComponent("Main St")
    );
  });
});
