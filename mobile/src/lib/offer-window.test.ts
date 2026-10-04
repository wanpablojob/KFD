import { offerWindowLabel } from "./offer-window";

const at = (iso: string) => iso;

describe("offerWindowLabel", () => {
  it("derives 5 minutes from the offers themselves", () => {
    expect(
      offerWindowLabel([
        {
          offeredAt: at("2026-10-04T10:00:00Z"),
          expiresAt: at("2026-10-04T10:05:00Z"),
        },
      ])
    ).toBe("5 minutes");
  });

  it("uses the singular for a one-minute window", () => {
    expect(
      offerWindowLabel([
        {
          offeredAt: at("2026-10-04T10:00:00Z"),
          expiresAt: at("2026-10-04T10:01:00Z"),
        },
      ])
    ).toBe("1 minute");
  });

  it("follows a changed server window without a code edit", () => {
    // The regression: the copy used to be a hardcoded "5 minutes". If the
    // server-side window moves to 90s, this must say so instead of lying.
    expect(
      offerWindowLabel([
        {
          offeredAt: at("2026-10-04T10:00:00Z"),
          expiresAt: at("2026-10-04T10:01:30Z"),
        },
      ])
    ).toBe("2 minutes");
  });

  it("agrees across several offers sharing one window", () => {
    expect(
      offerWindowLabel([
        {
          offeredAt: at("2026-10-04T10:00:00Z"),
          expiresAt: at("2026-10-04T10:03:00Z"),
        },
        {
          offeredAt: at("2026-10-04T11:20:00Z"),
          expiresAt: at("2026-10-04T11:23:00Z"),
        },
      ])
    ).toBe("3 minutes");
  });

  it("says nothing when offers disagree, rather than picking one", () => {
    expect(
      offerWindowLabel([
        {
          offeredAt: at("2026-10-04T10:00:00Z"),
          expiresAt: at("2026-10-04T10:05:00Z"),
        },
        {
          offeredAt: at("2026-10-04T11:00:00Z"),
          expiresAt: at("2026-10-04T11:01:30Z"),
        },
      ])
    ).toBeNull();
  });

  it("says nothing with no offers to learn from", () => {
    expect(offerWindowLabel([])).toBeNull();
  });

  it("says nothing on unparseable timestamps", () => {
    expect(
      offerWindowLabel([
        { offeredAt: at("not-a-date"), expiresAt: at("also-not-a-date") },
      ])
    ).toBeNull();
  });

  it("ignores an offer whose expiry precedes its offer", () => {
    expect(
      offerWindowLabel([
        {
          offeredAt: at("2026-10-04T10:05:00Z"),
          expiresAt: at("2026-10-04T10:00:00Z"),
        },
      ])
    ).toBeNull();
  });

  it("uses the valid offers when one row is malformed", () => {
    expect(
      offerWindowLabel([
        { offeredAt: at("nope"), expiresAt: at("nope") },
        {
          offeredAt: at("2026-10-04T10:00:00Z"),
          expiresAt: at("2026-10-04T10:05:00Z"),
        },
      ])
    ).toBe("5 minutes");
  });
});
