import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_MESSAGE_LENGTH,
  handleParse,
  parseWithGemini,
  sanitizeStops,
  type ParseGuardDeps,
} from "./pabakal-parse.ts";

// ---------------------------------------------------------------------------
// The untrusted reply
// ---------------------------------------------------------------------------

test("keeps only store, name and quantity, and clamps quantities to 1-99", () => {
  const stops = sanitizeStops([
    {
      store: "Mercury Drug",
      total: 500,
      note: "ignore me",
      items: [
        { name: "Biogesic", quantity: 2, price: 12 },
        { name: "Neozep", quantity: 150 },
        { name: "Bulb", quantity: 0 },
        { name: "Sardinas", quantity: "3" },
        { name: "", quantity: 4 },
        { name: "No number" },
        "not an item",
      ],
    },
  ]);

  assert.deepEqual(stops, [
    {
      store: "Mercury Drug",
      items: [
        { name: "Biogesic", quantity: 2 },
        { name: "Neozep", quantity: 99 },
        { name: "Bulb", quantity: 1 },
        { name: "Sardinas", quantity: 3 },
      ],
    },
  ]);
});

test("a store with nothing usable in it is dropped", () => {
  const stops = sanitizeStops([
    { store: "Mercury", items: [] },
    { store: "Citi", items: [{ name: "Bulb", quantity: 1 }] },
  ]);

  assert.deepEqual(stops, [
    { store: "Citi", items: [{ name: "Bulb", quantity: 1 }] },
  ]);
});

test("a store with no name is kept so the phone can highlight it", () => {
  const stops = sanitizeStops([
    { store: "", items: [{ name: "Bulb", quantity: 1 }] },
  ]);

  assert.deepEqual(stops, [
    { store: "", items: [{ name: "Bulb", quantity: 1 }] },
  ]);
});

test("a reply that is not a non-empty array is rejected", () => {
  assert.equal(sanitizeStops(null), null);
  assert.equal(sanitizeStops({ stops: [] }), null);
  assert.equal(sanitizeStops("[]"), null);
  assert.equal(sanitizeStops([]), null);
  assert.equal(sanitizeStops([{ store: "Mercury", items: [] }]), null);
});

test("never more than 5 stores or 30 lines reach the form", () => {
  const manyLines = Array.from({ length: 8 }, (_, s) => ({
    store: `Store ${s}`,
    items: Array.from({ length: 10 }, (_, i) => ({
      name: `Item ${s}-${i}`,
      quantity: 1,
    })),
  }));

  const capped = sanitizeStops(manyLines)!;
  assert.ok(capped.length <= 5);
  assert.equal(
    capped.reduce((lines, stop) => lines + stop.items.length, 0),
    30
  );

  const manyStores = Array.from({ length: 8 }, (_, s) => ({
    store: `Store ${s}`,
    items: [{ name: "Item", quantity: 1 }],
  }));
  assert.equal(sanitizeStops(manyStores)!.length, 5);
});

// ---------------------------------------------------------------------------
// The model call
// ---------------------------------------------------------------------------

const geminiReply = (text: string, status = 200) => async () =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("without a key it falls back instead of calling anyone", async () => {
  let called = false;
  const outcome = await parseWithGemini("dose ka biogesic sa mercury", {
    key: "",
    fetchImpl: (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch,
  });

  assert.deepEqual(outcome, { fallback: "no-key" });
  assert.equal(called, false);
});

test("a model error falls back", async () => {
  const outcome = await parseWithGemini("2 biogesic sa mercury", {
    key: "test-key",
    fetchImpl: geminiReply("{}", 500) as unknown as typeof fetch,
  });

  assert.deepEqual(outcome, { fallback: "model-error" });
});

test("a network failure falls back", async () => {
  const outcome = await parseWithGemini("2 biogesic sa mercury", {
    key: "test-key",
    fetchImpl: (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch,
  });

  assert.deepEqual(outcome, { fallback: "model-error" });
});

test("a malformed reply falls back", async () => {
  const outcome = await parseWithGemini("2 biogesic sa mercury", {
    key: "test-key",
    fetchImpl: geminiReply("here you go: two biogesic") as unknown as typeof fetch,
  });

  assert.deepEqual(outcome, { fallback: "malformed" });
});

test("an empty reply falls back", async () => {
  const outcome = await parseWithGemini("2 biogesic sa mercury", {
    key: "test-key",
    fetchImpl: geminiReply("") as unknown as typeof fetch,
  });

  assert.deepEqual(outcome, { fallback: "malformed" });
});

test("a good reply is sanitised before it is returned", async () => {
  const stops = [
    {
      store: "Mercury",
      secret: "drop me",
      items: [{ name: "Biogesic", quantity: 12, price: 8 }],
    },
  ];

  const outcome = await parseWithGemini("dose ka biogesic sa mercury", {
    key: "test-key",
    fetchImpl: geminiReply(JSON.stringify(stops)) as unknown as typeof fetch,
  });

  assert.deepEqual(outcome, {
    stops: [{ store: "Mercury", items: [{ name: "Biogesic", quantity: 12 }] }],
  });
});

test("sends the message text only, with the key in a header", async () => {
  let seenUrl = "";
  let seenHeaders: Headers | undefined;
  let seenBody = "";

  await parseWithGemini("2 biogesic sa mercury", {
    key: "test-key",
    model: "gemini-3.8-flash",
    fetchImpl: (async (url: string, init: RequestInit) => {
      seenUrl = url;
      seenHeaders = new Headers(init.headers);
      seenBody = String(init.body);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "[]" }] } }] }), {
        status: 200,
      });
    }) as unknown as typeof fetch,
  });

  assert.match(seenUrl, /models\/gemini-3\.8-flash:generateContent$/);
  assert.equal(seenHeaders?.get("x-goog-api-key"), "test-key");
  assert.ok(!seenUrl.includes("test-key"), "the key must never be in the URL");

  const body = JSON.parse(seenBody);
  assert.equal(body.contents[0].parts[0].text, "2 biogesic sa mercury");
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.ok(body.generationConfig.responseSchema);
  // Gemini rejects an ARRAY at the top level of a response schema, which is
  // why the stops ride inside an object. An array here fails every call with
  // 400, and 400 is not retried -- the phone silently gets no parse at all.
  assert.equal(body.generationConfig.responseSchema.type, "OBJECT");
});

test("unwraps the stops object the schema asks for", async () => {
  const outcome = await parseWithGemini("2 biogesic sa mercury", {
    key: "k",
    model: "gemini-3.8-flash",
    fetchImpl: (async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      stops: [{ store: "Mercury Drug", items: [{ name: "Biogesic", quantity: 2 }] }],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch,
  });
  assert.deepEqual(outcome, {
    stops: [{ store: "Mercury Drug", items: [{ name: "Biogesic", quantity: 2 }] }],
  });
});

// ---------------------------------------------------------------------------
// The route's guard
// ---------------------------------------------------------------------------

const allow: ParseGuardDeps["limit"] = () => ({
  allowed: true,
  retryAfterSeconds: 0,
});

const parsed = async () => ({
  stops: [{ store: "Mercury", items: [{ name: "Biogesic", quantity: 2 }] }],
});

const request = (options: { token?: string; body?: unknown } = {}) =>
  new Request("https://kfd.test/api/pabakal/parse", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: JSON.stringify(options.body ?? { message: "2 biogesic sa mercury" }),
  });

test("a signed-out caller is refused before anything is parsed", async () => {
  let called = false;
  const result = await handleParse(request(), {
    verify: async () => "someone",
    limit: allow,
    parse: async () => {
      called = true;
      return parsed();
    },
  });

  assert.equal(result.status, 401);
  assert.equal(called, false);
});

test("a token that does not verify is refused", async () => {
  const result = await handleParse(request({ token: "bad" }), {
    verify: async () => null,
    limit: allow,
    parse: parsed,
  });

  assert.equal(result.status, 401);
});

test("the per-customer limit refuses, with Retry-After", async () => {
  const result = await handleParse(request({ token: "good" }), {
    verify: async () => "user-1",
    limit: () => ({ allowed: false, retryAfterSeconds: 7 }),
    parse: parsed,
  });

  assert.equal(result.status, 429);
  assert.equal(result.headers?.["Retry-After"], "7");
});

test("the limit is keyed on the verified caller, not the body", async () => {
  let seenKey = "";
  await handleParse(request({ token: "good", body: { message: "x", user: "victim" } }), {
    verify: async () => "user-1",
    limit: (key) => {
      seenKey = key;
      return { allowed: true, retryAfterSeconds: 0 };
    },
    parse: parsed,
  });

  assert.equal(seenKey, "pabakal-parse:user-1");
});

test("a good message returns the stops", async () => {
  const result = await handleParse(request({ token: "good" }), {
    verify: async () => "user-1",
    limit: allow,
    parse: parsed,
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    stops: [{ store: "Mercury", items: [{ name: "Biogesic", quantity: 2 }] }],
  });
});

test("a fallback is a normal 200, so the phone parses locally", async () => {
  const result = await handleParse(request({ token: "good" }), {
    verify: async () => "user-1",
    limit: allow,
    parse: async () => ({ fallback: "no-key" }),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { fallback: "no-key" });
});

test("an empty message is refused", async () => {
  const result = await handleParse(request({ token: "good", body: { message: "   " } }), {
    verify: async () => "user-1",
    limit: allow,
    parse: parsed,
  });

  assert.equal(result.status, 400);
});

test("an over-long message is refused before the model is called", async () => {
  let called = false;
  const result = await handleParse(
    request({ token: "good", body: { message: "x".repeat(MAX_MESSAGE_LENGTH + 1) } }),
    {
      verify: async () => "user-1",
      limit: allow,
      parse: async () => {
        called = true;
        return parsed();
      },
    }
  );

  assert.equal(result.status, 400);
  assert.equal(called, false);
});
