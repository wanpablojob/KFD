/**
 * Fill the Pabakal form from a Messenger-style message.
 *
 * Fill only: this reads text into form rows. It sends nothing and calls no
 * RPC. The customer still checks the form and taps Send pabakal, which is the
 * one place a pabakal is validated and placed.
 *
 * The server's Gemini parse is tried first. When it is not configured, down,
 * rate-limited, or its reply cannot be trusted, it answers with a fallback and
 * the phone's own rule-based parser reads the message instead, so the box
 * always does something.
 */

import { postApiJson } from "./admin-api";
import { PABAKAL_RULES, type StopDraft } from "./pabakal";
import { cleanItemName, parsePabakalMessage } from "./pabakal-parse";

interface ServerStop {
  store: string;
  items: { name: string; quantity: number }[];
}

type ServerReply = { stops: ServerStop[] } | { fallback?: string };

/** Rows in the shape the form and cleanStops already use. */
type DraftLike = {
  store: string;
  items: { name: string; quantity: number | string }[];
};

/**
 * The form rows from whatever the server said.
 *
 * A reply with stops is used; anything else (a fallback reason, no reply at
 * all, an unreadable body) is read locally. Every row is rebuilt here, so a
 * shape the server did not promise cannot reach the form.
 */
export function stopsFromReply(reply: unknown, message: string): StopDraft[] {
  const serverStops =
    typeof reply === "object" &&
    reply !== null &&
    Array.isArray((reply as { stops?: unknown }).stops) &&
    (reply as { stops: unknown[] }).stops.length > 0
      ? (reply as ServerReply & { stops: ServerStop[] }).stops
      : null;

  const source: DraftLike[] = serverStops ?? parsePabakalMessage(message);

  return source
    .slice(0, PABAKAL_RULES.maxStores)
    .map((stop) => ({
      store: typeof stop.store === "string" ? stop.store : "",
      items: (Array.isArray(stop.items) ? stop.items : [])
        .filter((item) => item && typeof item.name === "string" && item.name.trim())
        // The product only, never part of a sentence, whichever reader it came from.
        .map((item) => ({
          name: cleanItemName(item.name),
          quantity: String(item.quantity),
        }))
        .filter((item) => item.name),
    }))
    .filter((stop) => stop.items.length > 0);
}

/** How long the chat waits for the AI before reading the message itself. */
export const AI_WAIT_MS = 3500;

/** Ask the server, then fall back to reading the message on the phone. */
export async function readPabakalMessage(message: string): Promise<StopDraft[]> {
  // The customer is waiting in a chat: past this, the phone's own reader
  // answers instead of the AI, which can take much longer when it is busy.
  const reply = await postApiJson<ServerReply>(
    "/api/pabakal/parse",
    { message },
    AI_WAIT_MS
  );
  return stopsFromReply(reply, message);
}
