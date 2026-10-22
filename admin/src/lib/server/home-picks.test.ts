import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handlePicks,
  picksWithGemini,
  sanitizePicks,
  sanitizeProfile,
  type Profile,
} from "./home-picks.ts";

const PROFILE: Profile = {
  now: { weekday: 4, hour: 12 },
  history: [{ restaurant_id: "a", weekday: 4, hour: 12, items: ["Inasal"] }],
  favorites: [],
  open: [
    { id: "a", name: "Inasal Place", cuisine: "Filipino", rating: 4.5 },
    { id: "b", name: "Cafe", cuisine: "Coffee", rating: 4 },
  ],
};

const request = (body: unknown, token = "t") =>
  new Request("http://x/api/home/picks", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });

const allow = () => ({ allowed: true, retryAfterSeconds: 0 });

test("the profile is rebuilt: unknown fields dropped, bad values refused", () => {
  const p = sanitizeProfile({
    ...PROFILE,
    phone: "0917",
    open: [{ ...PROFILE.open[0], address: "secret" }],
  });
  assert.deepEqual(Object.keys(p ?? {}).sort(), [
    "favorites",
    "history",
    "now",
    "open",
  ]);
  assert.deepEqual(Object.keys(p!.open[0]).sort(), [
    "cuisine",
    "id",
    "name",
    "rating",
  ]);
  assert.equal(
    sanitizeProfile({ ...PROFILE, now: { weekday: 9, hour: 12 } }),
    null,
  );
  assert.equal(sanitizeProfile({ ...PROFILE, open: [] }), null);
});

test("picks must be open restaurants from the profile, once each", () => {
  assert.deepEqual(
    sanitizePicks(
      {
        greeting: "Kaon ta!",
        picks: [
          { restaurant_id: "a", reason: "Your usual lunch" },
          { restaurant_id: "a", reason: "twice" },
          { restaurant_id: "nowhere", reason: "invented" },
        ],
      },
      PROFILE,
    ),
    {
      greeting: "Kaon ta!",
      picks: [{ restaurant_id: "a", reason: "Your usual lunch" }],
    },
  );
  assert.deepEqual(sanitizePicks({ picks: [] }, PROFILE), {
    fallback: "malformed",
  });
});

test("no key, a failed call or a bad reply are fallbacks, not errors", async () => {
  assert.deepEqual(await picksWithGemini(PROFILE, {}), { fallback: "no-key" });
  const down = async () => new Response("", { status: 503 });
  assert.deepEqual(
    await picksWithGemini(PROFILE, { key: "k", fetchImpl: down }),
    {
      fallback: "model-error",
    },
  );
  const junk = async () =>
    Response.json({
      candidates: [{ content: { parts: [{ text: "not json" }] } }],
    });
  assert.deepEqual(
    await picksWithGemini(PROFILE, { key: "k", fetchImpl: junk }),
    {
      fallback: "malformed",
    },
  );
});

test("signed-out and over-limit callers are refused before the model is asked", async () => {
  let asked = 0;
  const ask = async () => {
    asked += 1;
    return { fallback: "no-key" as const };
  };
  const out = await handlePicks(request({ profile: PROFILE }, ""), {
    verify: async () => "u",
    limit: allow,
    ask,
  });
  assert.equal(out.status, 401);
  const limited = await handlePicks(request({ profile: PROFILE }), {
    verify: async () => "u",
    limit: () => ({ allowed: false, retryAfterSeconds: 30 }),
    ask,
  });
  assert.equal(limited.status, 429);
  assert.equal(asked, 0);
  const ok = await handlePicks(request({ profile: PROFILE }), {
    verify: async () => "u",
    limit: allow,
    ask,
  });
  assert.equal(ok.status, 200);
  assert.equal(asked, 1);
});
