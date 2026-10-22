import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { reportServerError } from "@/lib/server/report-error";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { handlePicks, picksWithGemini } from "@/lib/server/home-picks";

/**
 * POST /api/home/picks
 *
 * "Picked for you" on the customer Home tab. Reads a taste profile the phone
 * built from the customer's own orders and asks Gemini for up to four open
 * restaurants with a reason each. Writes nothing.
 *
 * Requires a signed-in caller: `Authorization: Bearer <supabase access token>`.
 *
 * Body:   { profile: { now, history, favorites, open } }
 * Reply:  { greeting, picks: [{ restaurant_id, reason }] }
 *      or { fallback: "no-key" | "model-error" | "malformed" }
 *
 * A `fallback` is a normal 200: the phone then picks by its own rules. The
 * profile carries no name, phone, address or money; see lib/server/home-picks.
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
    const result = await handlePicks(req, {
      verify: verifyCaller,
      limit: checkRateLimit,
      ask: (profile) =>
        picksWithGemini(profile, {
          key: process.env.GEMINI_API_KEY,
          model: process.env.GEMINI_MODEL,
        }),
    });
    return NextResponse.json(result.body, {
      status: result.status,
      headers: result.headers,
    });
  } catch (error) {
    reportServerError(error, "home/picks");
    return NextResponse.json({ fallback: "model-error" });
  }
}
