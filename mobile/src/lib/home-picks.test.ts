import {
  buildTasteProfile,
  greetingFor,
  picksFromReply,
  rulePicks,
  type TasteRestaurant,
} from "./home-picks";

jest.mock("./admin-api", () => ({ postApiJson: jest.fn() }));

const r = (
  id: string,
  cuisine: string,
  rating: number,
  is_open = true
): TasteRestaurant => ({
  id,
  name: id,
  cuisine,
  rating,
  is_open,
});
const at = (day: number, hour: number) =>
  new Date(2026, 9, 18 + day, hour).toISOString();
const order = (restaurant_id: string, placed_at: string, status = "delivered") => ({
  restaurant_id,
  status,
  placed_at,
  items: [{ name: "Inasal" }],
});

// Thursday 22 Oct 2026, 12:00.
const NOON = new Date(2026, 9, 22, 12);

describe("buildTasteProfile", () => {
  it("keeps delivered history, open places only, and nothing personal", () => {
    const p = buildTasteProfile(
      [order("a", at(0, 12)), order("b", at(1, 19), "cancelled")],
      [r("a", "Filipino", 4.5), r("c", "Pizza", 4, false)],
      ["a"],
      NOON
    );
    expect(p.history).toEqual([
      { restaurant_id: "a", weekday: 0, hour: 12, items: ["Inasal"] },
    ]);
    expect(p.open.map((o) => o.id)).toEqual(["a"]);
    expect(Object.keys(p.open[0]).sort()).toEqual(["cuisine", "id", "name", "rating"]);
  });
});

describe("rulePicks", () => {
  it("puts the lunch regular first, then cuisine they like, then top rated", () => {
    const p = buildTasteProfile(
      [
        order("inasal", at(0, 12)),
        order("inasal", at(1, 13)),
        order("pizza", at(2, 20)),
      ],
      [
        r("inasal", "Filipino", 4),
        r("pizza", "Pizza", 3),
        r("lechon", "Filipino", 4.2),
        r("cafe", "Coffee", 4.9),
      ],
      [],
      NOON
    );
    const picks = rulePicks(p).picks;
    expect(picks[0]).toEqual({
      restaurant_id: "inasal",
      reason: "You often order here around this time",
    });
    expect(picks.find((x) => x.restaurant_id === "lechon")?.reason).toBe(
      "Because you like Filipino"
    );
  });

  it("gives a new customer the best rated places", () => {
    const p = buildTasteProfile([], [r("a", "X", 3), r("b", "Y", 4.8)], [], NOON);
    expect(rulePicks(p).picks[0]).toEqual({
      restaurant_id: "b",
      reason: "Top rated and open now",
    });
  });

  it("greets in Hiligaynon for the time of day", () => {
    expect(greetingFor(7)).toMatch(/^Maayong aga/);
    expect(greetingFor(12)).toMatch(/^Maayong udto/);
    expect(greetingFor(20)).toMatch(/^Maayong gab-i/);
  });
});

describe("picksFromReply", () => {
  const p = buildTasteProfile([], [r("a", "X", 4), r("b", "Y", 4)], [], NOON);

  it("keeps only open restaurants it was given, once each", () => {
    const out = picksFromReply(
      {
        greeting: "Kaon ta!",
        picks: [
          { restaurant_id: "a", reason: "Sakto sa udto" },
          { restaurant_id: "a", reason: "again" },
          { restaurant_id: "elsewhere", reason: "invented" },
          { restaurant_id: "b", reason: "" },
        ],
      },
      p
    );
    expect(out).toEqual({
      greeting: "Kaon ta!",
      picks: [{ restaurant_id: "a", reason: "Sakto sa udto" }],
      source: "ai",
    });
  });

  it("falls back to the rules on a missing or useless reply", () => {
    expect(picksFromReply(null, p).source).toBe("rules");
    expect(picksFromReply({ fallback: "no-key" }, p).source).toBe("rules");
    expect(
      picksFromReply({ picks: [{ restaurant_id: "zzz", reason: "x" }] }, p).source
    ).toBe("rules");
  });
});
