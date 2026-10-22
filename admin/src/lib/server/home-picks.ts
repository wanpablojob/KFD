/**
 * "Picked for you" on the customer Home tab: AI picks from a taste profile.
 *
 * The phone sends a profile built from the customer's own delivered orders and
 * what is open now (restaurants, cuisines, item names, day and hour -- no name,
 * phone, address or money). Gemini answers with a greeting and up to four open
 * restaurants, each with a short reason. Everything it says is checked here,
 * and the phone checks it again; any failure answers `fallback` and the phone
 * picks by its own rules.
 *
 * Same contract as pabakal-parse: verified caller, a per-account rate limit,
 * the key and model are server settings, and a fallback is a normal 200.
 */

export const MAX_PICKS = 4;
const MAX_HISTORY = 20;
const MAX_OPEN = 40;
const MAX_TEXT = 80;

export interface Profile {
  now: { weekday: number; hour: number };
  history: {
    restaurant_id: string;
    weekday: number;
    hour: number;
    items: string[];
  }[];
  favorites: string[];
  open: { id: string; name: string; cuisine: string; rating: number }[];
}

export type PicksOutcome =
  | { greeting: string; picks: { restaurant_id: string; reason: string }[] }
  | { fallback: "no-key" | "model-error" | "malformed" };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max = MAX_TEXT) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const int = (v: unknown, lo: number, hi: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null;

/** The profile as sent, rebuilt so only the promised fields, bounded, go to the model. */
export function sanitizeProfile(raw: unknown): Profile | null {
  if (!isRecord(raw) || !isRecord(raw.now)) return null;
  const weekday = int(raw.now.weekday, 0, 6);
  const hour = int(raw.now.hour, 0, 23);
  if (weekday === null || hour === null) return null;

  const open = (Array.isArray(raw.open) ? raw.open : [])
    .filter(isRecord)
    .map((r) => ({
      id: text(r.id),
      name: text(r.name),
      cuisine: text(r.cuisine, 40),
      rating:
        typeof r.rating === "number" && r.rating >= 0 && r.rating <= 5
          ? r.rating
          : 0,
    }))
    .filter((r) => r.id && r.name)
    .slice(0, MAX_OPEN);
  if (open.length === 0) return null;

  const history = (Array.isArray(raw.history) ? raw.history : [])
    .filter(isRecord)
    .map((h) => ({
      restaurant_id: text(h.restaurant_id),
      weekday: int(h.weekday, 0, 6) ?? 0,
      hour: int(h.hour, 0, 23) ?? 0,
      items: (Array.isArray(h.items) ? h.items : [])
        .map((i) => text(i, 60))
        .filter(Boolean)
        .slice(0, 5),
    }))
    .filter((h) => h.restaurant_id)
    .slice(0, MAX_HISTORY);

  const favorites = (Array.isArray(raw.favorites) ? raw.favorites : [])
    .map((f) => text(f))
    .filter(Boolean)
    .slice(0, 20);

  return { now: { weekday, hour }, history, favorites, open };
}

/** The model's answer, kept only where it names open restaurants from the profile. */
export function sanitizePicks(raw: unknown, profile: Profile): PicksOutcome {
  if (!isRecord(raw) || !Array.isArray(raw.picks))
    return { fallback: "malformed" };
  const open = new Set(profile.open.map((r) => r.id));
  const seen = new Set<string>();
  const picks: { restaurant_id: string; reason: string }[] = [];
  for (const p of raw.picks) {
    if (!isRecord(p)) continue;
    const id = text(p.restaurant_id);
    const reason = text(p.reason);
    if (!open.has(id) || seen.has(id) || !reason) continue;
    seen.add(id);
    picks.push({ restaurant_id: id, reason });
    if (picks.length === MAX_PICKS) break;
  }
  if (picks.length === 0) return { fallback: "malformed" };
  return { greeting: text(raw.greeting), picks };
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const SYSTEM_PROMPT = `You pick restaurants for a customer of KFD, a food delivery app in Kabankalan City, Negros Occidental, Philippines.
You get the current day and hour, the customer's recent delivered orders, their favourite restaurant ids, and the restaurants open right now.
Choose up to ${MAX_PICKS} restaurants ONLY from the "open" list, by restaurant id. Prefer places they go back to at this time of day or this day of the week, then cuisines and dishes they like, then well-rated places worth trying. Mix in one new place when they have history.
For each pick write a short, friendly reason (max 60 characters) that refers to their habits or the time of day, e.g. "Your usual Friday lunch" or "You liked inasal; try their lechon".
Also write a warm one-line greeting (max 60 characters) that fits the time of day. Light Hiligaynon or Taglish is welcome.
Never invent restaurant ids. Return JSON only.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    greeting: { type: "STRING" },
    picks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          restaurant_id: { type: "STRING" },
          reason: { type: "STRING" },
        },
        required: ["restaurant_id", "reason"],
      },
    },
  },
  required: ["greeting", "picks"],
};

export interface GeminiOptions {
  key?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

/** Ask Gemini. Every failure is a fallback reason, never a throw. */
export async function picksWithGemini(
  profile: Profile,
  options: GeminiOptions = {},
): Promise<PicksOutcome> {
  const key = options.key?.trim();
  if (!key) return { fallback: "no-key" };
  const model = options.model?.trim() || "gemini-3.8-flash";
  const send = options.fetchImpl ?? fetch;

  const prompt = JSON.stringify({
    now: { day: DAYS[profile.now.weekday], hour: profile.now.hour },
    history: profile.history.map((h) => ({ ...h, weekday: DAYS[h.weekday] })),
    favorites: profile.favorites,
    open: profile.open,
  });

  let response: Response;
  try {
    response = await send(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.4,
            maxOutputTokens: 600,
          },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    return { fallback: "model-error" };
  }
  if (!response.ok) return { fallback: "model-error" };

  try {
    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const answer = (payload.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
    return sanitizePicks(JSON.parse(answer), profile);
  } catch {
    return { fallback: "malformed" };
  }
}

export interface PicksDeps {
  verify: (token: string) => Promise<string | null>;
  limit: (
    key: string,
    limit: number,
    windowMs: number,
  ) => {
    allowed: boolean;
    retryAfterSeconds: number;
  };
  ask: (profile: Profile) => Promise<PicksOutcome>;
}

/** The phone caches picks for a meal window, so a few a minute is generous. */
export const RATE_LIMIT = 6;
export const RATE_WINDOW_MS = 60_000;

/** Who is calling, how often, and whether the profile is fit to send. */
export async function handlePicks(
  req: Request,
  deps: PicksDeps,
): Promise<{
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return { status: 401, body: { error: "Unauthorized" } };
  const callerId = await deps.verify(token);
  if (!callerId) return { status: 401, body: { error: "Unauthorized" } };

  const limited = deps.limit(
    `home-picks:${callerId}`,
    RATE_LIMIT,
    RATE_WINDOW_MS,
  );
  if (!limited.allowed) {
    return {
      status: 429,
      body: { error: "Too many requests." },
      headers: { "Retry-After": String(limited.retryAfterSeconds) },
    };
  }

  const payload = (await req.json().catch(() => null)) as {
    profile?: unknown;
  } | null;
  const profile = sanitizeProfile(payload?.profile);
  if (!profile)
    return { status: 400, body: { error: "Nothing to pick from." } };

  return { status: 200, body: await deps.ask(profile) };
}
