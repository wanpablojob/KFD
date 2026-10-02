import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Expo, type ExpoPushMessage } from "expo-server-sdk";

/**
 * Expo Push send path (Prompt 6.2).
 *
 * Addresses every push token registered to the merchant users of a restaurant.
 * Uses expo-server-sdk, which chunks, throttles and retries on its own; the
 * only responsibility here is reading the right tokens and pruning the ones
 * Expo reports as dead.
 *
 * This follows the existing best-effort contract in /api/orders/notify: the
 * order status is saved first, the alert second, and a failure here is reported
 * to the caller as a skipped channel -- never raised back into the order write.
 */

export interface PushResult {
  ok: boolean;
  sent: number;
  skipped?: string;
  detail?: string;
}

// Service-role clients are created with default generics in the notify route;
// the schema generics add nothing here because RLS is bypassed either way.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = SupabaseClient<any>;

export async function sendMerchantOrderPush(
  supabase: ServiceClient,
  restaurantId: string,
  orderReference: string
): Promise<PushResult> {
  // Tokens belong to merchant accounts of the restaurant. app_users keys the
  // role/restaurant link; push_tokens keys the device. A flat read avoids a
  // join across a table the service role (bypassing RLS) can read either way.
  const { data: appUsers, error: usersError } = await supabase
    .from("app_users")
    .select("user_id")
    .eq("restaurant_id", restaurantId)
    .eq("role", "merchant");

  if (usersError) {
    return { ok: false, sent: 0, detail: usersError.message };
  }

  const userIds = (appUsers ?? []).map((u) => u.user_id as string);
  if (userIds.length === 0) {
    return { ok: false, sent: 0, skipped: "no merchant account for this restaurant" };
  }

  const { data: tokens, error: tokensError } = await supabase
    .from("push_tokens")
    .select("token")
    .in("user_id", userIds);

  if (tokensError) {
    return { ok: false, sent: 0, detail: tokensError.message };
  }

  const validTokens = (tokens ?? [])
    .map((t) => t.token as string)
    .filter((token) => Expo.isExpoPushToken(token));

  if (validTokens.length === 0) {
    return { ok: false, sent: 0, skipped: "no push tokens for this restaurant" };
  }

  const messages: ExpoPushMessage[] = validTokens.map((to) => ({
    to,
    sound: "default",
    channelId: "orders",
    title: `New order ${orderReference}`,
    body: "A new KFD order needs your attention.",
    data: { reference: orderReference },
  }));

  const expo = new Expo();

  try {
    // Chunking, throttling and retry are the SDK's job. We only pair each
    // receipt id with its token at send time so a DeviceNotRegistered receipt
    // maps straight back to the row to prune.
    const receiptTokenPairs: { id: string; token: string }[] = [];
    for (const chunk of expo.chunkPushNotifications(messages)) {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      for (let i = 0; i < tickets.length; i += 1) {
        const ticket = tickets[i];
        const token = chunk[i]?.to;
        if (ticket.status === "ok" && typeof token === "string") {
          receiptTokenPairs.push({ id: ticket.id, token });
        }
      }
    }

    const receiptIds = receiptTokenPairs.map((p) => p.id);
    const tokensByReceiptId = new Map(receiptTokenPairs.map((p) => [p.id, p.token]));

    const toPrune: string[] = [];
    for (const chunk of expo.chunkPushNotificationReceiptIds(receiptIds)) {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      for (const key in receipts) {
        const receipt = receipts[key];
        if (receipt.status === "error" && receipt.details?.error === "DeviceNotRegistered") {
          const token = tokensByReceiptId.get(key);
          if (token) toPrune.push(token);
        }
      }
    }

    // Pruning is housekeeping: a failure here must not fail the push.
    if (toPrune.length > 0) {
      try {
        await supabase.from("push_tokens").delete().in("token", toPrune);
      } catch {
        // housekeeping only
      }
    }

    return { ok: true, sent: messages.length };
  } catch (err) {
    return {
      ok: false,
      sent: 0,
      detail: err instanceof Error ? err.message : "Expo push send failed",
    };
  }
}
/**
 * Expo Push send path for riders.
 *
 * Same best-effort contract as sendMerchantOrderPush: the delivery is already
 * recorded, so a push failure is housekeeping and never raised back into the
 * caller's write.
 *
 * Unlike the merchant path this reads push_tokens straight by user_id. There is
 * no restaurant fan-out to resolve -- a rider's tokens hang off their own auth
 * user -- so going via app_users would be an extra join that only ever matches
 * or doesn't, and app_users has no rider row for a provisioned rider, which is
 * exactly how the rider path silently found nobody.
 */
export async function sendRiderPush(
  supabase: ServiceClient,
  riderUserId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<PushResult> {
  const { data: tokens, error: tokensError } = await supabase
    .from("push_tokens")
    .select("token")
    .eq("user_id", riderUserId);

  if (tokensError) {
    return { ok: false, sent: 0, detail: tokensError.message };
  }

  const validTokens = (tokens ?? [])
    .map((t) => t.token as string)
    .filter((token) => Expo.isExpoPushToken(token));

  if (validTokens.length === 0) {
    return { ok: false, sent: 0, skipped: "no push tokens for this rider" };
  }

  const messages: ExpoPushMessage[] = validTokens.map((to) => ({
    to,
    sound: "default",
    channelId: "orders",
    title,
    body,
    ...(data ? { data } : {}),
  }));

  const expo = new Expo();

  try {
    const receiptTokenPairs: { id: string; token: string }[] = [];
    for (const chunk of expo.chunkPushNotifications(messages)) {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      for (let i = 0; i < tickets.length; i += 1) {
        const ticket = tickets[i];
        const token = chunk[i]?.to;
        if (ticket.status === "ok" && typeof token === "string") {
          receiptTokenPairs.push({ id: ticket.id, token });
        }
      }
    }

    const toPrune: string[] = [];
    const receiptIds = receiptTokenPairs.map((p) => p.id);
    const tokensByReceiptId = new Map(receiptTokenPairs.map((p) => [p.id, p.token]));
    for (const chunk of expo.chunkPushNotificationReceiptIds(receiptIds)) {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      for (const key in receipts) {
        const receipt = receipts[key];
        if (receipt.status === "error" && receipt.details?.error === "DeviceNotRegistered") {
          const token = tokensByReceiptId.get(key);
          if (token) toPrune.push(token);
        }
      }
    }

    // Housekeeping only: never let a prune failure fail the send.
    if (toPrune.length > 0) {
      try {
        await supabase.from("push_tokens").delete().in("token", toPrune);
      } catch {
        // housekeeping only
      }
    }

    return { ok: true, sent: messages.length };
  } catch (err) {
    return {
      ok: false,
      sent: 0,
      detail: err instanceof Error ? err.message : "Expo push send failed",
    };
  }
}
