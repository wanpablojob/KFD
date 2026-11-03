import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendRiderPush, OFFERS_CHANNEL_ID } from "@/lib/server/push-notify";
import { offerQueueFilter } from "@/lib/offer-queue";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches push-notify's ServiceClient
type ServiceClient = SupabaseClient<any>;

export interface QueuedOffer {
  id: number;
  order_id: string | null;
  delivery_id: string | null;
  rider_id: string;
}

/**
 * The push for one queued offer: the rider is told the reference, and their
 * app opens the order or the trip. Shared by the scheduler's sender
 * (/api/dispatch/push-offers) and the placement notify, so both say the same.
 * True when the rider has a login to push to.
 */
export async function sendQueuedOffer(
  supabase: ServiceClient,
  row: QueuedOffer,
): Promise<boolean> {
  // The reference the rider sees, and the id their app opens.
  let reference = "";
  let data: Record<string, unknown> = { type: "dispatch_offer" };
  if (row.delivery_id) {
    const { data: trip } = await supabase
      .from("deliveries")
      .select("reference")
      .eq("id", row.delivery_id)
      .maybeSingle();
    reference = trip?.reference ?? "";
    data = { type: "dispatch_offer", deliveryId: row.delivery_id, reference };
  } else if (row.order_id) {
    const { data: order } = await supabase
      .from("orders")
      .select("reference")
      .eq("id", row.order_id)
      .maybeSingle();
    reference = order?.reference ?? "";
    data = { type: "dispatch_offer", orderId: row.order_id, reference };
  }

  const { data: rider } = await supabase
    .from("riders")
    .select("id, user_id")
    .eq("id", row.rider_id)
    .maybeSingle();
  if (!rider?.user_id) return false;

  await sendRiderPush(
    supabase,
    rider.user_id,
    "New delivery offer",
    reference
      ? `Order ${reference} is available. Open the app to accept it.`
      : "There is a delivery available near you. Open the app to accept it.",
    data,
    // Its own channel: an offer expires in minutes and is worth chasing.
    OFFERS_CHANNEL_ID,
  );
  return true;
}

/**
 * Send a just-placed order's offer pushes now, instead of at the next
 * per-minute run of the scheduler (0100/0121).
 *
 * The rows are claimed first (sent_at set, only where still unsent), so the
 * scheduler skips them and a rider is told once, whichever gets there first.
 * Best-effort like every notify path: the offers are live either way, and a
 * row claimed here whose push fails is not retried, the same rule the
 * scheduler follows for a rider with no phone.
 */
export async function pushOffersNow(
  supabase: ServiceClient,
  ids: { orderId?: string | null; deliveryId?: string | null },
): Promise<number> {
  const filter = offerQueueFilter(ids);
  if (!filter) return 0;

  const { data: claimed, error } = await supabase
    .from("reoffer_push_queue")
    .update({ sent_at: new Date().toISOString() })
    .is("sent_at", null)
    .or(filter)
    .select("id, order_id, delivery_id, rider_id");
  if (error || !claimed) return 0;

  const sent = await Promise.all(
    (claimed as QueuedOffer[]).map((row) =>
      sendQueuedOffer(supabase, row).catch(() => false),
    ),
  );
  return sent.filter(Boolean).length;
}
