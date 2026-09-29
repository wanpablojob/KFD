import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/push/register
 *
 * Stores an Expo push token for the signed-in user. Server-side only: the
 * service role key lives here, never in the mobile bundle (Prompt 6.2).
 *
 * Requires a signed-in caller: `Authorization: Bearer <supabase access token>`.
 * The token is verified, not trusted, because writing a token is signing that
 * device up for pushes that are then sent on behalf of the platform.
 *
 * Body:
 *   { "deviceId": string, "token": "ExponentPushToken[...]", "platform": "ios"|"android" }
 *
 * deviceId is a client-generated stable id (expo-constants installationId or
 * similar). It is not a secret, but it must be stable per install so a
 * rotation replaces the old registration rather than accumulating rows.
 *
 * The upsert conflict target is `token` (unique), so the same physical device
 * re-registering after a reinstall -- which changes nothing about its token,
 * and possibly its deviceId -- overwrites instead of duplicating. A token that
 * has genuinely rotated arrives as a different `token` and gets its own row.
 *
 * DELETE /api/push/register?deviceId=<id>
 *
 * Removes the caller's registration for that device -- used on sign-out so the
 * next person at the same phone does not keep receiving the first person's
 * pushes. Scoped to auth.uid() by the id, and never to a token the caller does
 * not own.
 */

interface RegisterBody {
  deviceId?: string;
  token?: string;
  platform?: string;
}

export const runtime = "nodejs";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Deliberately NOT NEXT_PUBLIC_*: this key bypasses RLS and must never be
  // inlined into a browser bundle.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, { auth: { persistSession: false } });
}

async function authenticatedCaller(
  req: Request,
  supabase: ReturnType<typeof serviceClient>
): Promise<{ callerId: string; error: NextResponse | null }> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!token) {
    return { callerId: "", error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey || !supabase) {
    return {
      callerId: "",
      error: NextResponse.json(
        { error: "Server is missing Supabase configuration" },
        { status: 500 }
      ),
    };
  }

  const caller = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
  } = await caller.auth.getUser(token);

  if (!user) {
    return { callerId: "", error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { callerId: user.id, error: null };
}

export async function POST(req: Request) {
  const supabase = serviceClient();
  const { callerId, error } = await authenticatedCaller(req, supabase);
  if (error) return error;
  // authenticatedCaller returns a 500 above when supabase is null, so by here
  // it is set; TypeScript cannot see through the destructured guard.
  const client = supabase!;

  const body = (await req.json().catch(() => ({}))) as RegisterBody;
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const platform = typeof body.platform === "string" ? body.platform.trim() : "";

  if (!deviceId || !token || !platform) {
    return NextResponse.json(
      { error: "deviceId, token and platform are required" },
      { status: 400 }
    );
  }

  if (!/^ExponentPushToken\[[a-zA-Z0-9_-]+\]$/.test(token)) {
    return NextResponse.json(
      { error: "token is not a valid Expo push token" },
      { status: 400 }
    );
  }

  if (platform !== "ios" && platform !== "android") {
    return NextResponse.json(
      { error: "platform must be ios or android" },
      { status: 400 }
    );
  }

  // Cap deviceId -- it is free-form client input, and it is going into a
  // primary key. The real identity is the token; the id only needs to be
  // stable, not arbitrary.
  if (deviceId.length > 200) {
    return NextResponse.json(
      { error: "deviceId is too long" },
      { status: 400 }
    );
  }

  const { error: upsertError } = await client.from("push_tokens").upsert(
    { id: deviceId, user_id: callerId, token, platform },
    { onConflict: "token", ignoreDuplicates: false }
  );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = serviceClient();
  const { callerId, error } = await authenticatedCaller(req, supabase);
  if (error) return error;
  const client = supabase!;

  const url = new URL(req.url);
  const deviceId = (url.searchParams.get("deviceId") ?? "").trim();

  if (!deviceId) {
    return NextResponse.json(
      { error: "deviceId is required" },
      { status: 400 }
    );
  }

  // Scope the delete to the caller's own row. user_id = callerId is enforced
  // by RLS, but the route uses the service role which bypasses RLS, so state
  // it explicitly here as well: without it, any signed-in user could revoke
  // any device's token.
  const { error: deleteError } = await client
    .from("push_tokens")
    .delete()
    .eq("id", deviceId)
    .eq("user_id", callerId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}