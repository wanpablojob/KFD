import {
  FIELD_MESSAGES,
  parseCash,
  proofPath,
  validateCompletion,
  type CompletionInput,
} from "./delivery-proof";

function input(over: Partial<CompletionInput> = {}): CompletionInput {
  return {
    orderId: "ord_1",
    payment: "cash",
    orderTotal: 500,
    photoUri: "file:///tmp/photo.jpg",
    cashCollected: "500",
    ...over,
  };
}

describe("parseCash", () => {
  it("reads a plain amount", () => {
    expect(parseCash("500")).toBe(500);
    expect(parseCash("500.50")).toBe(500.5);
  });

  it("tolerates the grouping and symbol a keypad produces", () => {
    expect(parseCash("1,250.75")).toBe(1250.75);
    expect(parseCash("₱500")).toBe(500);
  });

  it("treats empty and absent alike", () => {
    expect(parseCash("")).toBeNull();
    expect(parseCash("   ")).toBeNull();
    expect(parseCash(null)).toBeNull();
    expect(parseCash(undefined)).toBeNull();
  });

  it("rejects text with no digits", () => {
    expect(parseCash("abc")).toBeNull();
  });
});

describe("validateCompletion: cash", () => {
  it("accepts a matching amount with a photo", () => {
    const r = validateCompletion(input());
    expect(r.ok).toBe(true);
    expect(r.cash).toBe(500);
    expect(r.warning).toBeUndefined();
  });

  it("requires a photo on every order", () => {
    const r = validateCompletion(input({ photoUri: null }));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("photo-required");
  });

  it("treats a blank photo uri as no photo", () => {
    expect(validateCompletion(input({ photoUri: "   " })).error).toBe("photo-required");
  });

  it("requires a cash amount", () => {
    const r = validateCompletion(input({ cashCollected: null }));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("cash-required");
  });

  it("treats a zero amount as entered, not missing", () => {
    // A genuinely zero-collected delivery is real (fully comped, or paid by
    // another means and said so). Treating "0" as absent would make it
    // impossible to record, and silently recording nothing is worse.
    const r = validateCompletion(input({ cashCollected: "0" }));
    expect(r.ok).toBe(true);
    expect(r.cash).toBe(0);
  });

  it("rejects a negative amount rather than recording it as positive", () => {
    // Regression: the parser used to strip the minus sign, so "-50" became 50
    // and a negative collection would have been saved as a positive one.
    const r = validateCompletion(input({ cashCollected: "-50" }));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("cash-negative");
  });

  it("WARNGS but does not block when the amount disagrees with the total", () => {
    // This is the whole point of the decision: the delivery physically happened.
    const r = validateCompletion(input({ cashCollected: "450" }));
    expect(r.ok).toBe(true);
    expect(r.cash).toBe(450);
    expect(r.warning).toContain("500.00");
    expect(r.warning).toContain("450.00");
  });

  it("does not warn on a difference below a cent", () => {
    const r = validateCompletion(input({ cashCollected: "500.004" }));
    expect(r.ok).toBe(true);
    expect(r.warning).toBeUndefined();
  });

  it("flags an over-collection too", () => {
    expect(validateCompletion(input({ cashCollected: "1000" })).warning).toBeTruthy();
  });
});

describe("validateCompletion: e_wallet", () => {
  const wallet = (over: Partial<CompletionInput> = {}) =>
    input({ payment: "e_wallet", cashCollected: null, gcashReference: null, ...over });

  it("requires a photo", () => {
    expect(validateCompletion(wallet({ photoUri: null })).error).toBe("photo-required");
  });

  it("allows a missing reference, because absence is not a failure", () => {
    // A rider at a door with a customer who has no reference must still be able
    // to finish. The server stamps the omission and an operator sees it later.
    const r = validateCompletion(wallet());
    expect(r.ok).toBe(true);
    expect(r.reference).toBe("");
  });

  it("normalises a supplied reference", () => {
    const r = validateCompletion(wallet({ gcashReference: "  abc-123  " }));
    expect(r.ok).toBe(true);
    expect(r.reference).toBe("ABC-123");
  });

  it("rejects a malformed reference, which is not the same as absent", () => {
    const r = validateCompletion(wallet({ gcashReference: "ref#123" }));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("reference-invalid");
  });

  it("never invents a length rule", () => {
    // GCash formats have changed before. Anything alphanumeric is accepted and
    // the operator decides; only impossible characters are refused.
    expect(validateCompletion(wallet({ gcashReference: "1" })).ok).toBe(true);
    expect(validateCompletion(wallet({ gcashReference: "A".repeat(40) })).ok).toBe(
      true
    );
  });
});

describe("validateCompletion: card", () => {
  it("still requires a photo", () => {
    const r = validateCompletion(
      input({ payment: "card", cashCollected: null, photoUri: null })
    );
    expect(r.error).toBe("photo-required");
  });

  it("needs no money direction", () => {
    expect(validateCompletion(input({ payment: "card", cashCollected: null })).ok).toBe(
      true
    );
  });
});

describe("proofPath", () => {
  it("nests under the rider so the bucket policy is one comparison", () => {
    expect(proofPath("rdr_01", "ord_9", "image/jpeg")).toBe("rdr_01/ord_9.jpg");
  });

  it("keeps the extension the mime type implies", () => {
    expect(proofPath("rdr_01", "ord_9", "image/png")).toBe("rdr_01/ord_9.png");
    expect(proofPath("rdr_01", "ord_9", "image/webp")).toBe("rdr_01/ord_9.webp");
  });

  it("defaults to jpg for anything unexpected", () => {
    // The bucket only allows jpeg/png/webp, so anything else would be refused on
    // upload; defaulting keeps the name predictable rather than extensionless.
    expect(proofPath("rdr_01", "ord_9", "application/octet-stream")).toBe(
      "rdr_01/ord_9.jpg"
    );
  });
});

describe("every field error has a message", () => {
  it("does not leave the rider staring at an empty box", () => {
    for (const key of Object.keys(FIELD_MESSAGES)) {
      expect(FIELD_MESSAGES[key as keyof typeof FIELD_MESSAGES].length).toBeGreaterThan(
        10
      );
    }
  });
});
