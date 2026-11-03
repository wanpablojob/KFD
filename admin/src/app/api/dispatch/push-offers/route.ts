import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendQueuedOffer, type QueuedOffer } from "@/lib/server/offer-push";

export const runtime = "nodejs";

/**
 * POST /api/dispatch/push-offers
 *
 * Sends the pushes for offers the database re-offered on its own.
 *
 * Why this exists: an offer lives five minutes. When it lapses with nobody
 * taking it, the order waits -- until 0099, which re-offers it every minute
 * and queues the push for the riders it reached. A trigger cannot send a
 * push, so the queue is here: the database asks for the pushes to be sent,
 * this route sends them.
 *
 * The door: the request has to carry a token that is in the queue. Only the
 * database can put one there, so a token is proof that the request came from
 * the scheduler. It authorises "send the queued offer pushes" and nothing
 * else, and it is worthless once the queue is empty.
 *
 * Best-effort by contract, like the other notify routes: the offers are
 * already live whether or not this succeeds, so a push failure is reported in
 * the body and never turned into an error the scheduler has to handle.
 */

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Deliberately NOT NEXT_PUBLIC_*: bypasses RLS, must never reach a bundle.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  const token = req.headers.get("x-scheduler-token");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  // The token has to be one the database is still waiting on. A token for a
  // queue that has already been sent is no longer a request to send it.
  const { data: proof, error: proofError } = await supabase
    .from("reoffer_push_queue")
    .select("id")
    .eq("token", token)
    .is("sent_at", null)
    .limit(1);
  if (proofError) {
    return NextResponse.json({ error: "could not read the queue" }, { status: 500 });
  }
  if (!proof || proof.length === 0) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: rows, error: rowsError } = await supabase
    .from("reoffer_push_queue")
    .select("id, order_id, delivery_id, rider_id")
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (rowsError) {
    return NextResponse.json({ error: "could not read the queue" }, { status: 500 });
  }

  const queue = (rows ?? []) as QueuedOffer[];
  let notified = 0;

  for (const row of queue) {
    if (await sendQueuedOffer(supabase, row)) notified += 1;

    // Marked either way: a rider with no phone is not going to get one later.
    await supabase
      .from("reoffer_push_queue")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  return NextResponse.json({ notified, queued: queue.length });
}
