import { isEndedOffer } from "./notifications";

jest.mock("./supabase", () => ({ supabase: {} }));

describe("isEndedOffer", () => {
  const sent = "2026-11-19T08:00:00.000Z";
  const at = (minutes: number) => new Date(sent).getTime() + minutes * 60000;

  it("is ended five minutes after an offer alert was sent", () => {
    expect(isEndedOffer({ type: "dispatch_offer" }, sent, at(4))).toBe(false);
    expect(isEndedOffer({ type: "dispatch_offer" }, sent, at(6))).toBe(true);
  });

  it("only applies to offer alerts", () => {
    expect(isEndedOffer({ reference: "#KFD-1" }, sent, at(60))).toBe(false);
    expect(isEndedOffer(null, sent, at(60))).toBe(false);
  });
});
