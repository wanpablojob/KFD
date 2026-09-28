import { supabase } from "./supabase/client";

/**
 * Notification read state.
 *
 * There is deliberately no notifications table. Unreadness is derived: an order
 * is unread for a given operator if it was placed after that operator's
 * high-water mark on app_users. Storing a row per notification would make a
 * derivable fact into a second source of truth, and would need a write per read
 * plus a table to reconcile when an order is cancelled or removed.
 *
 * Account-scoped, not device-scoped, because a back-office machine is shared:
 * see migration 0015 for why localStorage was rejected.
 */

/** The operator's high-water mark, or null if they have never acknowledged one. */
export async function fetchNotificationCursor(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("app_users")
    .select("last_notification_seen_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data?.last_notification_seen_at as string | null) ?? null;
}

/**
 * Acknowledges everything currently in the bell and returns the new cursor, or
 * null if the caller has no app_users row.
 *
 * Goes through mark_notifications_seen() rather than an update, because app_users
 * is read-only over PostgREST by design. That function writes the caller's own
 * row and takes no user id, so it cannot be pointed at another account.
 */
export async function markNotificationsSeen(): Promise<string | null> {
  const { data, error } = await supabase.rpc("mark_notifications_seen");

  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}
