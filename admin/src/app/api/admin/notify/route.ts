import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendUserPush } from "@/lib/server/push-notify";
import { reportServerError } from "@/lib/server/report-error";
import { checkRateLimit } from "@/lib/server/rate-limit";
import {
  applicationNotice,
  refundNotice,
  suspensionNotice,
  type AdminNoticeKind,
  type Notice,
} from "@/lib/admin-notice";

/**
 * POST /api/admin/notify
 *
 * Tells the person an admin decision was about: a rider application reviewed,
 * a refund recorded, a rider suspended or reinstated. Push plus in-app inbox.
 * Called by the admin right after the RPC succeeds, like /api/dispatch/notify,
 * because a Postgres function cannot call this route.
 *
 * Admins only. Body: { kind: "application" | "refund" | "suspension", id }.
 * The message is built from the saved row, never from the body.
 *
 * Best-effort: the decision is already saved, so failures come back as a
 * reason in a 200, not an error the admin has to handle.
 */

export const runtime = "nodejs";

const KINDS: AdminNoticeKind[] = ["application", "refund", "suspension"];

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Deliberately NOT NEXT_PUBLIC_*: bypasses RLS, must never reach a bundle.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ skipped: "server is not configured" });

  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: caller } = await supabase
    .from("app_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (caller?.role !== "admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const limited = checkRateLimit(`admin-notify:${user.id}`, 30, 60_000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { kind?: string; id?: unknown };
  const kind = KINDS.find((k) => k === body.kind);
  const id = typeof body.id === "string" || typeof body.id === "number" ? String(body.id).trim() : "";
  if (!kind || !id) {
    return NextResponse.json({ error: "kind and id are required" }, { status: 400 });
  }

  let recipient: string | null = null;
  let notice: Notice | null = null;

  if (kind === "application") {
    const { data } = await supabase
      .from("rider_applications")
      .select("user_id, status, decision_note")
      .eq("id", id)
      .maybeSingle();
    recipient = data?.user_id ?? null;
    notice = data ? applicationNotice(data) : null;
  } else if (kind === "refund") {
    const { data } = await supabase
      .from("order_refunds")
      .select("amount, method, orders!inner(reference, customer_user_id)")
      .eq("id", id)
      .maybeSingle();
    const order = data?.orders as unknown as
      | { reference: string; customer_user_id: string | null }
      | null;
    recipient = order?.customer_user_id ?? null;
    notice =
      data && order
        ? refundNotice({ amount: Number(data.amount), method: data.method, reference: order.reference })
        : null;
  } else {
    const { data } = await supabase
      .from("riders")
      .select("user_id, suspended_at, suspended_reason")
      .eq("id", id)
      .maybeSingle();
    recipient = data?.user_id ?? null;
    notice = data ? suspensionNotice(data) : null;
  }

  if (!recipient || !notice) {
    return NextResponse.json({ skipped: "nobody to notify" });
  }

  try {
    return NextResponse.json(
      await sendUserPush(supabase, recipient, notice.title, notice.body, notice.data),
    );
  } catch (err) {
    reportServerError(err, "admin/notify");
    return NextResponse.json({ ok: false, sent: 0, detail: "send failed" });
  }
}
