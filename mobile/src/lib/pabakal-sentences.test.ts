/**
 * Thousands of ways a customer types a pabakal, checked end to end through the
 * phone's reader and the item clean-up (stopsFromReply with no AI reply).
 *
 * A smaller cut of the 2.3 million combinations the reader was checked against
 * when it was built: greetings, order openers in Hiligaynon, Tagalog and
 * English, quantities as words or digits before the item, after it, after the
 * store or as "tig n", one or two items, one or two stores, every separator,
 * punctuation, capitals and emoji. Each must come out as exactly the product,
 * the quantity and the store -- never part of a sentence.
 */
import { chatIntent } from "./pabakal-parse";
import { stopsFromReply } from "./pabakal-from-message";

jest.mock("./admin-api", () => ({ postApiJson: jest.fn() }));
jest.mock("./supabase", () => ({ supabase: {} }));

const GREET = [
  "",
  "hello po",
  "MAYONG GAB E",
  "maayong aga po,",
  "hellooo 😊",
  "Good morning,",
];
const OPEN = [
  "",
  "mapabakal ko tani",
  "PABAKAL KO",
  "pwede po pabakal",
  "pabili ng",
  "can i order",
  "magpabakal ko sang",
];
const NUM: [string, number][] = [
  ["duwa", 2],
  ["dalawang", 2],
  ["3", 3],
  ["dose", 12],
  ["beinte singko", 25],
];
const STORES: [string, string][] = [
  ["", ""],
  ["sa mercury", "mercury"],
  ["from 7-eleven", "7-eleven"],
];
const END = ["", " po", " salamat!", "!!", " 🙏"];

type Shape = { store: string; items: [string, number][] }[];

function read(msg: string): Shape {
  return stopsFromReply(null, msg).map((s) => ({
    store: s.store.toLowerCase(),
    items: s.items.map((i): [string, number] => [
      i.name.toLowerCase(),
      Number(i.quantity),
    ]),
  }));
}

function failures(cases: [string, Shape][]): string[] {
  return cases
    .filter(
      ([msg, want]) =>
        chatIntent(msg) !== "shopping" ||
        JSON.stringify(read(msg)) !== JSON.stringify(want)
    )
    .slice(0, 5)
    .map(
      ([msg, want]) =>
        `${JSON.stringify(msg)}: want ${JSON.stringify(want)}, got ${JSON.stringify(read(msg))}`
    );
}

describe("pabakal sentences", () => {
  it("reads one item in every position a quantity can take", () => {
    const forms: [(i: string, n: string, s: string) => string, boolean][] = [
      [(i, n, s) => `${n} ka ${i} ${s}`, true],
      [(i, n, s) => `${i} ${n} kabilog ${s}`, true],
      [(i, n, s) => `${i} ${s} ${n} kabilog`, true],
      [(i, n, s) => `${i} ${s} tig ${n}`, true],
      [(i, _n, s) => `${i} ${s}`, false],
    ];
    const cases: [string, Shape][] = [];
    for (const g of GREET)
      for (const o of OPEN)
        for (const [n, q] of NUM)
          for (const [st, ws] of STORES)
            for (const e of END)
              for (const [form, hasQty] of forms) {
                if (!hasQty && n !== "duwa") continue;
                const msg = `${g} ${o} ${form("Bear Brand 300g", n, st)}${e}`;
                cases.push([
                  msg,
                  [{ store: ws, items: [["bear brand 300g", hasQty ? q : 1]] }],
                ]);
              }
    expect(cases.length).toBeGreaterThan(4000);
    expect(failures(cases)).toEqual([]);
  });

  it("reads two items, at one store or two, with every separator", () => {
    const joins = [" kag ", " at ", " and ", " tapos ", ", ", "\n"];
    const cases: [string, Shape][] = [];
    for (const g of GREET)
      for (const o of OPEN)
        for (const [n, q] of NUM)
          for (const j of joins)
            for (const e of END) {
              cases.push([
                `${g} ${o} ${n} ka biogesic${j}tatlo ka neozep sa mercury${e}`,
                [
                  {
                    store: "mercury",
                    items: [
                      ["biogesic", q],
                      ["neozep", 3],
                    ],
                  },
                ],
              ]);
              cases.push([
                `${g} ${o} ${n} ka biogesic sa mercury${j}tatlo ka neozep from 7-eleven${e}`,
                [
                  { store: "mercury", items: [["biogesic", q]] },
                  { store: "7-eleven", items: [["neozep", 3]] },
                ],
              ]);
            }
    expect(cases.length).toBeGreaterThan(2000);
    expect(failures(cases)).toEqual([]);
  });

  it("never treats small talk as an order", () => {
    const talk = [
      "hello po",
      "salamat po!",
      "ok sige",
      "how are you",
      "gud pm bai",
      "MAYONG GAB E",
      "hellooo 😊",
      "thank you so much",
      "uy musta na",
      "good morning po",
    ];
    expect(talk.filter((t) => chatIntent(t) === "shopping")).toEqual([]);
  });
});
