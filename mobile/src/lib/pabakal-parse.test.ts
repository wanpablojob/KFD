import { chatIntent, parsePabakalMessage } from "./pabakal-parse";

/** "Store: 2x a, 1x b" per stop, so a failure reads like the spec table. */
function read(message: string): string {
  return parsePabakalMessage(message)
    .map(
      (s) =>
        `${s.store || "(no store)"}: ${s.items
          .map((i) => `${i.quantity || "?"}x ${i.name}`)
          .join(", ")}`
    )
    .join(" · ");
}

describe("parsePabakalMessage", () => {
  it.each([
    [
      "pabakal ko 2 biogesic sa mercury kag isa ka bulb sa citi",
      "Mercury: 2x biogesic · Citi: 1x bulb",
    ],
    ["dose ka biogesic sa mercury", "Mercury: 12x biogesic"],
    ["katorse ka biogesic", "(no store): 14x biogesic"],
    ["duwa ka buok bulb, tatlo ka battery sa citi", "Citi: 2x bulb, 3x battery"],
    ["dalawang sardinas at isang bigas sa 7-eleven", "7-eleven: 2x sardinas, 1x bigas"],
    ["beinte singko ka itlog sa palengke", "Palengke: 25x itlog"],
    ["biogesic x2, neozep 3pcs sa mercury", "Mercury: 2x biogesic, 3x neozep"],
    ["dos ka coke kag dose ka pandesal sa bakery", "Bakery: 2x coke, 12x pandesal"],
    ["bulb sa citi", "Citi: 1x bulb"],
    [
      "pabakal ko tani duwa ka biogesic kag isa ka ibuprofen sa mercury",
      "Mercury: 2x biogesic, 1x ibuprofen",
    ],
    ["kag palihog tatlo ka itlog sa palengke", "Palengke: 3x itlog"],
    ["sana dalawang sardinas po", "(no store): 2x sardinas"],
  ])("%s", (message, expected) => {
    expect(read(message)).toBe(expected);
  });

  it("reads the other ways a number is written", () => {
    expect(read("trenta y dos ka itlog")).toBe("(no store): 32x itlog");
    expect(read("isang dosena itlog")).toBe("(no store): 12x itlog");
    expect(read("tatlong pandesal")).toBe("(no store): 3x pandesal");
    expect(read("Sampung Kandila sa may Gaisano")).toBe("Gaisano: 10x Kandila");
    expect(read("neozep 3 pcs")).toBe("(no store): 3x neozep");
  });

  it("leaves a number it cannot use blank instead of guessing", () => {
    expect(read("200 ka itlog sa palengke")).toBe("Palengke: ?x itlog");
  });

  it("keeps items on separate lines and ignores blank ones", () => {
    expect(read("2 biogesic\n\n1 neozep\nsa mercury")).toBe(
      "Mercury: 2x biogesic, 1x neozep"
    );
    expect(parsePabakalMessage("   ")).toEqual([]);
  });
});

describe("chatIntent", () => {
  it.each([
    ["hello", "greeting"],
    ["Hi po!", "greeting"],
    ["maayong aga", "greeting"],
    ["salamat sa inyo", "thanks"],
    ["thank you", "thanks"],
    ["ok sige", "other"],
    ["how are you", "other"],
    ["dose ka biogesic sa mercury", "shopping"],
    ["bulb sa citi", "shopping"],
    ["pabakal ko biogesic", "shopping"],
    ["biogesic x2", "shopping"],
    ["dalawang sardinas", "shopping"],
    // Slang, stretched letters and typos
    ["mayong gab e", "greeting"],
    ["maayong gab-i po", "greeting"],
    ["gud pm bai", "greeting"],
    ["hellooo!!", "greeting"],
    ["uy musta na day", "greeting"],
    ["kumsta", "greeting"],
    ["salamaaat gid", "thanks"],
    ["salamt kaayo te", "thanks"],
    ["tysm", "thanks"],
    ["sge2 hehe", "other"],
    ["okie dokie", "other"],
    ["mayong gab e, duwa ka biogesic sa mercury", "shopping"],
    ["salamat, tatlo pa ka itlog", "shopping"],
    ["pabakl ko biogesic", "shopping"],
    ["pbili biogesic", "shopping"],
  ])("%s -> %s", (message, intent) => {
    expect(chatIntent(message)).toBe(intent);
  });
});
