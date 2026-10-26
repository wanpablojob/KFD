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

/**
 * Keep a copy of the alert in each user's in-app inbox (0087). Written before
 * the device lookup, so a user with alerts switched off still sees it in the
 * app. Best-effort like the push itself: an inbox failure never fails a send.
 */
async function recordInbox(
  supabase: ServiceClient,
  userIds: string[],
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    await supabase
      .from("notifications")
      .insert(userIds.map((user_id) => ({ user_id, title, body, data })));
  } catch {
    // inbox is a courtesy on top of the push
  }
}

export async function sendMerchantOrderPush(
  supabase: ServiceClient,
  restaurantId: string,
  orderReference: string,
  /** Defaults to the new-order notice; a cancellation passes its own. */
  message: { title: string; body: string } = {
    title: `New order ${orderReference}`,
    body: "It is accepted. Start preparing it.",
  },
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
    return {
      ok: false,
      sent: 0,
      skipped: "no merchant account for this restaurant",
    };
  }

  await recordInbox(supabase, userIds, message.title, message.body, {
    reference: orderReference,
  });

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
    return {
      ok: false,
      sent: 0,
      skipped: "no push tokens for this restaurant",
    };
  }

  const messages: ExpoPushMessage[] = validTokens.map((to) => ({
    to,
    sound: "default",
    channelId: "orders",
    title: message.title,
    body: message.body,
    // A new order is the alert a restaurant cannot afford to read late: high
    // priority so a dozing Android phone is woken, and iOS time-sensitive so
    // Focus does not hold it back. Same reasoning as the rider offers below.
    priority: "high",
    interruptionLevel: "time-sensitive",
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
    const tokensByReceiptId = new Map(
      receiptTokenPairs.map((p) => [p.id, p.token]),
    );

    const toPrune: string[] = [];
    for (const chunk of expo.chunkPushNotificationReceiptIds(receiptIds)) {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      for (const key in receipts) {
        const receipt = receipts[key];
        if (
          receipt.status === "error" &&
          receipt.details?.error === "DeviceNotRegistered"
        ) {
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
/**
 * Send a push to every device registered to one auth user.
 *
 * Generic on purpose: a rider's tokens hang off their auth user (no fan-out to
 * resolve) and so do a customer's, so the same read serves both. The named
 * wrappers below exist only to say which caller the message is for.
 *
 * Best-effort contract, same as sendMerchantOrderPush: whatever write this
 * accompanies has already landed, so a push failure is reported in the return
 * value and never raised back into the caller.
 */
/**
 * Android channel ids. These are a contract with the rider app, which creates
 * them on launch: mobile/src/lib/push.ts, ORDERS_CHANNEL_ID / OFFERS_CHANNEL_ID.
 * Android discards a message addressed to a channel that does not exist on the
 * device, so the two sides have to agree and both have to actually create them.
 */
export const ORDERS_CHANNEL_ID = "orders";
export const OFFERS_CHANNEL_ID = "offers";

export async function sendUserPush(
  supabase: ServiceClient,
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  /** Defaults to the order-alert channel; offers override it. */
  channelId: string = ORDERS_CHANNEL_ID,
): Promise<PushResult> {
  await recordInbox(supabase, [userId], title, body, data);

  const { data: tokens, error: tokensError } = await supabase
    .from("push_tokens")
    .select("token")
    .eq("user_id", userId);

  if (tokensError) {
    return { ok: false, sent: 0, detail: tokensError.message };
  }

  const validTokens = (tokens ?? [])
    .map((t) => t.token as string)
    .filter((token) => Expo.isExpoPushToken(token));

  if (validTokens.length === 0) {
    return { ok: false, sent: 0, skipped: "no push tokens for this rider" };
  }

  // Delivery timing is part of correctness for an offer: it expires in five
  // minutes, so a message FCM batches until the phone leaves doze is worthless.
  // High priority wakes the device instead. On iOS the same reasoning is
  // `interruptionLevel`, which stops Focus from filing the offer under the lock
  // screen's summary; it is iOS-only and ignored for Android tokens. Without the
  // Time Sensitive Notifications entitlement iOS still delivers it, just at the
  // normal interruption level.
  const isOffer = channelId === OFFERS_CHANNEL_ID;

  const messages: ExpoPushMessage[] = validTokens.map((to) => ({
    to,
    sound: "default",
    channelId,
    title,
    body,
    ...(isOffer
      ? { priority: "high" as const, interruptionLevel: "time-sensitive" as const }
      : {}),
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
    const tokensByReceiptId = new Map(
      receiptTokenPairs.map((p) => [p.id, p.token]),
    );
    for (const chunk of expo.chunkPushNotificationReceiptIds(receiptIds)) {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      for (const key in receipts) {
        const receipt = receipts[key];
        if (
          receipt.status === "error" &&
          receipt.details?.error === "DeviceNotRegistered"
        ) {
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

/**
 * Named wrapper: push to a rider's own device(s).
 *
 * `channelId` exists so an offer can land on the high-importance offers channel
 * instead of sharing the order-alert channel with merchant news. Defaults keep
 * every other caller unchanged.
 */
export async function sendRiderPush(
  supabase: ServiceClient,
  riderUserId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  channelId?: string,
): Promise<PushResult> {
  return sendUserPush(supabase, riderUserId, title, body, data, channelId);
}

/** Named wrapper: push to a customer's device(s) about their own order. */
export async function sendCustomerPush(
  supabase: ServiceClient,
  customerUserId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<PushResult> {
  return sendUserPush(supabase, customerUserId, title, body, data);
}
