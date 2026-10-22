import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MODEL, FALLBACK_MODELS, geminiGenerateContent, modelChain } from "./gemini.ts";

const ok = (text: string) => async () =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const status = (code: number) => async () => new Response("{}", { status: code });

/** Records the model each attempt asked for, so the chain is visible. */
const chainRecorder = (replies: (() => Promise<Response>)[]) => {
  const asked: string[] = [];
  const fetchImpl = (async (url: string) => {
    const model = decodeURIComponent(url.split("/models/")[1].split(":")[0]);
    asked.push(model);
    const next = replies.shift() ?? status(503);
    return next();
  }) as unknown as typeof fetch;
  return { asked, fetchImpl };
};

test("no key is no-key, and no request is made", async () => {
  let called = false;
  const outcome = await geminiGenerateContent({
    key: "  ",
    body: {},
    fetchImpl: (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch,
  });
  assert.deepEqual(outcome, { ok: false, fallback: "no-key" });
  assert.equal(called, false);
});

test("a busy model moves to the next one instead of giving up", async () => {
  const { asked, fetchImpl } = chainRecorder([status(503), ok("hello")]);
  const outcome = await geminiGenerateContent({ key: "k", body: {}, fetchImpl });
  assert.equal(outcome.ok, true);
  assert.equal(asked.length, 2);
  assert.deepEqual(asked, [DEFAULT_MODEL, FALLBACK_MODELS[0]]);
});

test("a retired model (404) is retried the same way", async () => {
  const { asked, fetchImpl } = chainRecorder([status(404), ok("hello")]);
  const outcome = await geminiGenerateContent({ key: "k", body: {}, fetchImpl });
  assert.equal(outcome.ok, true);
  assert.equal(asked.length, 2);
});

test("a refused key stops on the first answer", async () => {
  const { asked, fetchImpl } = chainRecorder([status(403), ok("never")]);
  const outcome = await geminiGenerateContent({ key: "k", body: {}, fetchImpl });
  assert.deepEqual(outcome, { ok: false, fallback: "model-error" });
  assert.equal(asked.length, 1);
});

test("every model busy is still a fallback, not a throw", async () => {
  const { asked, fetchImpl } = chainRecorder([status(503), status(503), status(503)]);
  const outcome = await geminiGenerateContent({ key: "k", body: {}, fetchImpl });
  assert.deepEqual(outcome, { ok: false, fallback: "model-error" });
  assert.equal(asked.length, modelChain().length);
});

test("a network failure is treated like a busy model", async () => {
  const { asked, fetchImpl } = chainRecorder([
    async () => {
      throw new TypeError("fetch failed");
    },
    ok("hello"),
  ]);
  const outcome = await geminiGenerateContent({ key: "k", body: {}, fetchImpl });
  assert.equal(outcome.ok, true);
  assert.equal(asked.length, 2);
});

test("a 200 whose body is not JSON is malformed, not ok", async () => {
  const outcome = await geminiGenerateContent({
    key: "k",
    body: {},
    fetchImpl: (async () => new Response("not json", { status: 200 })) as unknown as typeof fetch,
  });
  assert.deepEqual(outcome, { ok: false, fallback: "malformed" });
});

test("the configured model leads the chain, and is not repeated", () => {
  assert.deepEqual(modelChain("gemini-3.5-flash"), ["gemini-3.5-flash", "gemini-2.5-flash"]);
  assert.deepEqual(modelChain(), [DEFAULT_MODEL, ...FALLBACK_MODELS]);
});
