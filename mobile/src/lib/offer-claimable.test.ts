import {
  countClaimableOffers,
  isOfferClaimable,
  secondsUntilExpiry,
} from "./offer-claimable";

const T0 = new Date("2026-05-01T10:00:00Z").getTime();
const inTwoMinutes = new Date(T0 + 120_000).toISOString();
const aMinuteAgo = new Date(T0 - 60_000).toISOString();
const inOneSecond = new Date(T0 + 1000).toISOString();

describe("secondsUntilExpiry", () => {
  it("counts down to the expiry", () => {
    expect(secondsUntilExpiry(inTwoMinutes, T0)).toBe(120);
  });

  it("clamps a past expiry to zero rather than reporting negative time", () => {
    expect(secondsUntilExpiry(aMinuteAgo, T0)).toBe(0);
  });

  it("rounds rather than truncating, so the last second is not shown as 0 early", () => {
    expect(secondsUntilExpiry(inOneSecond, T0)).toBe(1);
  });
});

describe("isOfferClaimable", () => {
  it("is true for a live offer on a live order", () => {
    expect(
      isOfferClaimable({ orderStatus: "preparing", expiresAt: inTwoMinutes }, T0)
    ).toBe(true);
  });

  it("is false once the window has closed", () => {
    expect(
      isOfferClaimable({ orderStatus: "preparing", expiresAt: aMinuteAgo }, T0)
    ).toBe(false);
  });

  it("is false for a delivered order even inside the window", () => {
    expect(
      isOfferClaimable({ orderStatus: "delivered", expiresAt: inTwoMinutes }, T0)
    ).toBe(false);
  });

  it("is false for a cancelled order even inside the window", () => {
    expect(
      isOfferClaimable({ orderStatus: "cancelled", expiresAt: inTwoMinutes }, T0)
    ).toBe(false);
  });

  it("treats an unknown status as claimable rather than hiding work", () => {
    // Better to offer a row the server then refuses than to silently drop an
    // offer whose status string this build has not seen.
    expect(
      isOfferClaimable({ orderStatus: "queued", expiresAt: inTwoMinutes }, T0)
    ).toBe(true);
  });
});

describe("countClaimableOffers", () => {
  const offers = [
    { orderStatus: "preparing", expiresAt: inTwoMinutes },
    { orderStatus: "confirmed", expiresAt: aMinuteAgo },
    { orderStatus: "cancelled", expiresAt: inTwoMinutes },
    { orderStatus: "out_for_delivery", expiresAt: inTwoMinutes },
  ];

  it("counts only offers that can still be accepted", () => {
    expect(countClaimableOffers(offers, T0)).toBe(2);
  });

  it("counts zero for an empty list", () => {
    expect(countClaimableOffers([], T0)).toBe(0);
  });

  it("counts zero once everything has expired", () => {
    expect(
      countClaimableOffers(
        offers.map((o) => ({ ...o, expiresAt: aMinuteAgo })),
        T0
      )
    ).toBe(0);
  });
});
