/**
 * One Gemini call, with the retry that is actually worth making.
 *
 * Both AI routes asked one model and gave up on the first non-200. Production
 * then answered, for both of them, `{"fallback":"model-error"}` -- because the
 * newest Flash model was answering 503 UNAVAILABLE, "This model is currently
 * experiencing high demand. Spikes in demand are usually temporary." The
 * feature worked; the model was busy, and nothing tried a second one.
 *
 * So the chain: the configured model first, then two stable Flash models. 404
 * (a retired id) and 429/5xx (busy, gateway) say nothing about the request, so
 * they are worth another ask. A refused key (401/403) or a bad request (400)
 * stops on the first answer -- retrying those only spends quota.
 *
 * A network failure or a timeout also moves to the next model: from the phone's
 * point of view it is the same "the model did not answer".
 */

/** What the routes use when GEMINI_MODEL is not set. */
export const DEFAULT_MODEL = "gemini-3.8-flash";

/** Tried in order when the preferred model does not answer. */
export const FALLBACK_MODELS = [
  "gemini-3.5-flash",
  "gemini-2.5-flash",
] as const;

/** Statuses that are about the model, not the request. */
const RETRY_STATUS = new Set([404, 429, 500, 502, 503, 504]);

/**
 * Per attempt. Three attempts stay well inside the route budget while still
 * leaving room for a cold start.
 */
const TIMEOUT_MS = 9_000;

export type GeminiFallback = "no-key" | "model-error" | "malformed";

export type GeminiOutcome =
  | { ok: true; payload: unknown; model: string }
  | { ok: false; fallback: GeminiFallback };

export interface GeminiRequest {
  key?: string;
  /** GEMINI_MODEL: the preferred model, when the caller has one. */
  model?: string;
  /** The generateContent body, without `contents`/`generationConfig` wrapping. */
  body: unknown;
  fetchImpl?: typeof fetch;
}

/**
 * Both routes do small jobs (read a shopping list, pick four restaurants), and
 * Flash models think by default, which costs seconds the chat cannot spare.
 * "low" is accepted by every Flash model Google lists; a model that refuses it
 * anyway (400) is asked again without it, so this can only make replies
 * faster, never stop them.
 */
export function withLowThinking(body: unknown): unknown {
  if (typeof body !== "object" || body === null) return body;
  const config =
    (body as { generationConfig?: Record<string, unknown> }).generationConfig ??
    {};
  if ("thinkingConfig" in config) return body;
  return {
    ...body,
    generationConfig: { ...config, thinkingConfig: { thinkingLevel: "low" } },
  };
}

/** The models to try, in order, with no duplicates. */
export function modelChain(preferred?: string): string[] {
  const first = preferred?.trim() || DEFAULT_MODEL;
  return [...new Set([first, ...FALLBACK_MODELS])];
}

export async function geminiGenerateContent(
  request: GeminiRequest,
): Promise<GeminiOutcome> {
  const key = request.key?.trim();
  if (!key) return { ok: false, fallback: "no-key" };

  const send = request.fetchImpl ?? fetch;

  const call = (model: string, body: unknown) =>
    send(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
  const fast = withLowThinking(request.body);

  for (const model of modelChain(request.model)) {
    let response: Response;
    try {
      response = await call(model, fast);
      // A model that does not take the thinking setting: same model, without it.
      if (response.status === 400 && fast !== request.body) {
        response = await call(model, request.body);
      }
    } catch {
      continue;
    }

    if (!response.ok) {
      if (RETRY_STATUS.has(response.status)) continue;
      return { ok: false, fallback: "model-error" };
    }

    try {
      return { ok: true, payload: await response.json(), model };
    } catch {
      return { ok: false, fallback: "malformed" };
    }
  }

  return { ok: false, fallback: "model-error" };
}
