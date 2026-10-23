import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendRiderPush, OFFERS_CHANNEL_ID } from "@/lib/server/push-notify";
import { reportServerError } from "@/lib/server/report-error";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { mayAnnouncePabakal, pabakalAlertBody } from "@/lib/pabakal-alert";

/**
 * POST /api/pabakal/notify
 *
 * Tells online riders that a pabakal is waiting. Called by the customer app
 * right after customer_request_pabakal succeeds, because a Postgres function
 * cannot call this route.
 *
 * Requires a signed-in caller: `Authorization: Bearer <supabase access token>`.
 * Body: { id: string }  -- the pabakal the caller just placed.
 *
 * Best-effort: the request is already saved and listed on every rider's
 * Available tab, so failures come back as a reason in a 200.
 */
export const runtime = "nodejs";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Deliberately NOT NEXT_PUBLIC_*: bypasses RLS, must never reach a bundle.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (!token)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = serviceClient();
  if (!supabase)
    return NextResponse.json({ skipped: "server is not configured" });

  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A customer places at most two at a time (0120); this only stops a script
  // from ringing every rider's phone on a loop.
  const limited = checkRateLimit(`pabakal-notify:${user.id}`, 5, 60_000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    const { data: row } = await supabase
      .from("pabakal_requests")
      .select("customer_user_id, status, store, stops")
      .eq("id", id)
      .maybeSingle();
    if (!row || !mayAnnouncePabakal(user.id, row)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: riders } = await supabase
      .from("riders")
      .select("user_id")
      .eq("status", "online")
      .is("archived_at", null)
      .is("suspended_at", null)
      .not("user_id", "is", null);

    const message = pabakalAlertBody(row);
    const results = await Promise.all(
      (riders ?? []).map((r) =>
        sendRiderPush(
          supabase,
          r.user_id as string,
          "New pabakal",
          message,
          { type: "pabakal_offer" },
          OFFERS_CHANNEL_ID,
        ),
      ),
    );
    return NextResponse.json({ notified: results.filter((r) => r.ok).length });
  } catch (error) {
    reportServerError(error, "pabakal/notify");
    return NextResponse.json({ notified: 0, detail: "send failed" });
  }
}
