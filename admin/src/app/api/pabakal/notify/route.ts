import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  sendCustomerPush,
  sendRiderPush,
  OFFERS_CHANNEL_ID,
} from "@/lib/server/push-notify";
import { reportServerError } from "@/lib/server/report-error";
import { checkRateLimit } from "@/lib/server/rate-limit";
import {
  mayAnnouncePabakal,
  mayAnnouncePabakalStatus,
  pabakalAlertBody,
  pabakalStatusNotice,
} from "@/lib/pabakal-alert";

/**
 * POST /api/pabakal/notify
 *
 * Two jobs, by the pabakal's status (a Postgres function cannot call this route):
 *   open  -> online riders hear a pabakal is waiting. Sent by its customer.
 *   later -> the customer hears it was taken, bought, delivered or cancelled.
 *            Sent by the assigned rider, or an admin for a cancellation.
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
      .select(
        "customer_user_id, status, store, stops, reference, item_cost, delivery_fee, pabakal_fee, cancel_reason, rider_id",
      )
      .eq("id", id)
      .maybeSingle();
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Past "open", the news is for the customer: taken, bought, delivered or
    // cancelled. Only the assigned rider or an admin may announce it.
    if (row.status !== "open") {
      const { data: caller } = await supabase
        .from("app_users")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      const { data: rider } = row.rider_id
        ? await supabase
            .from("riders")
            .select("user_id")
            .eq("id", row.rider_id)
            .maybeSingle()
        : { data: null };
      if (
        !mayAnnouncePabakalStatus(
          { userId: user.id, role: (caller?.role as string | null) ?? null },
          (rider?.user_id as string | null) ?? null,
        )
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const notice = pabakalStatusNotice(row);
      if (!notice || !row.customer_user_id) {
        return NextResponse.json({ skipped: "nobody to tell" });
      }
      return NextResponse.json(
        await sendCustomerPush(
          supabase,
          row.customer_user_id,
          notice.title,
          notice.body,
          {
            type: "pabakal_status",
          },
        ),
      );
    }

    if (!mayAnnouncePabakal(user.id, row)) {
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
