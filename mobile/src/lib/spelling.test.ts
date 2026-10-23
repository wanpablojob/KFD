import { correctName, correctStops, describeCorrections } from "./spelling";

describe("correctName", () => {
  it.each([
    ["biogisic", "Biogesic"],
    ["neozp", "Neozep"],
    ["paracetaml", "Paracetamol"],
    ["sardinass", "Sardinas"],
    ["mercuri drug", "Mercury drug"],
    ["watsns", "Watsons"],
    ["safegaurd", "Safeguard"],
    ["ibu", "Ibuprofen"],
    ["acetylcestein", "Acetylcysteine"],
    ["amlodipin", "Amlodipine"],
    ["bio", "Biogesic"],
    ["para", "Paracetamol"],
  ])("%s -> %s", (typed, fixed) => {
    expect(correctName(typed).text).toBe(fixed);
  });

  it("leaves correct words, short words and unknown local names alone", () => {
    expect(correctName("Biogesic").corrections).toEqual([]);
    expect(correctName("biogesic").corrections).toEqual([]);
    expect(correctName("ulam").text).toBe("ulam");
    expect(correctName("Lola Remedios lechon").text).toBe("Lola Remedios lechon");
    expect(correctName("Biogesic 500mg").text).toBe("Biogesic 500mg");
  });

  it("does not guess between two equally close words", () => {
    // "beer" is one letter from both "Bear" and "Beef", and is a real product.
    expect(correctName("beer").text).toBe("beer");
  });
});

describe("correctStops", () => {
  it("fixes stores and items and reports each change once", () => {
    const out = correctStops([
      {
        store: "mercuri",
        items: [
          { name: "biogisic", quantity: "2" },
          { name: "biogisic", quantity: "1" },
        ],
      },
    ]);
    expect(out.stops).toEqual([
      {
        store: "Mercury",
        items: [
          { name: "Biogesic", quantity: "2" },
          { name: "Biogesic", quantity: "1" },
        ],
      },
    ]);
    expect(describeCorrections(out.corrections)).toBe(
      "mercuri → Mercury, biogisic → Biogesic"
    );
  });
});
