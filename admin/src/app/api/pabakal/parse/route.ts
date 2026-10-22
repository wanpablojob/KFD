import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { reportServerError } from "@/lib/server/report-error";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { handleParse, parseWithGemini } from "@/lib/server/pabakal-parse";

/**
 * POST /api/pabakal/parse
 *
 * Reads a Messenger-style pabakal message into stores and items for the form.
 * Fill only: this route writes nothing and calls no RPC. Sending a pabakal is
 * still the customer's own tap, through customer_request_pabakal.
 *
 * Requires a signed-in caller: `Authorization: Bearer <supabase access token>`.
 * The token is verified, not trusted, because the model call costs money and
 * the free tier is rate-limited per account.
 *
 * Body:   { message: string }        max 500 characters
 * Reply:  { stops: [{ store, items: [{ name, quantity }] }] }
 *      or { fallback: "no-key" | "model-error" | "malformed" }
 *
 * A `fallback` is a normal 200: the phone then reads the message with its own
 * rule-based parser, so the box keeps working when the key is missing, the
 * model is down, or the reply cannot be trusted.
 *
 * Only the message text is sent to the provider. No name, phone, address or
 * order history leaves this server.
 *
 * The key is a server secret (GEMINI_API_KEY). It must never be NEXT_PUBLIC_*,
 * which is inlined into the browser and the mobile bundle. The model is a
 * server setting too, so moving to another provider needs no app change.
 */
export const runtime = "nodejs";

async function verifyCaller(token: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) return null;

  const client = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
  } = await client.auth.getUser(token);

  return user?.id ?? null;
}

export async function POST(req: Request) {
  try {
    const result = await handleParse(req, {
      verify: verifyCaller,
      limit: checkRateLimit,
      parse: (message) =>
        parseWithGemini(message, {
          key: process.env.GEMINI_API_KEY,
          model: process.env.GEMINI_MODEL,
        }),
    });

    return NextResponse.json(result.body, {
      status: result.status,
      headers: result.headers,
    });
  } catch (error) {
    reportServerError(error, "pabakal/parse");
    return NextResponse.json({ error: "Could not read that." }, { status: 500 });
  }
}
