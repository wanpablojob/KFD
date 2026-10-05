import { riderStatusMeta, RIDER_STATUSES } from "./rider-status";

describe("riderStatusMeta", () => {
  it("gives a friendly label instead of the raw enum", () => {
    expect(riderStatusMeta("online").label).toBe("Online");
    expect(riderStatusMeta("busy").label).toBe("Busy");
    expect(riderStatusMeta("offline").label).toBe("Offline");
  });

  it("spells out that offline means missing offers", () => {
    expect(riderStatusMeta("offline").description).toMatch(/miss offers/i);
  });

  it("says what online actually does", () => {
    expect(riderStatusMeta("online").description).toMatch(/offered/i);
  });

  it("shows an unknown status as itself rather than defaulting to online", () => {
    // Defaulting to online would be the one value that changes what dispatch
    // does with this rider.
    const meta = riderStatusMeta("on_break");
    expect(meta.label).toBe("on_break");
    expect(meta.description).toBe("Unknown status");
  });

  it("covers every status the UI offers", () => {
    for (const status of RIDER_STATUSES) {
      expect(riderStatusMeta(status).label).not.toBe(status);
    }
  });
});
