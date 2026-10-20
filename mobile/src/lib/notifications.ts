import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

/**
 * The in-app notifications inbox (0087): every alert the server sent this
 * user, kept after the push is swiped away. RLS scopes every read to the
 * signed-in user; the only write a client may make is setting read_at.
 */

export interface InboxItem {
  id: number;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

/** shortcut: newest 100 only; add paging if anyone needs older alerts. */
export async function fetchInbox(): Promise<InboxItem[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, body, data, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    data: (n.data ?? {}) as Record<string, unknown>,
    readAt: n.read_at,
    createdAt: n.created_at,
  }));
}

export async function markRead(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .is("read_at", null);
  if (error) throw error;
}

const KEY = ["inbox"] as const;

/**
 * The inbox, kept fresh two ways: a 60s poll, and an immediate refetch when a
 * push lands while the app is open (the server writes the row before it
 * sends the push, so the row is already there).
 */
export function useInbox() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: KEY });
    });
    return () => sub.remove();
  }, [queryClient]);

  return useQuery({
    queryKey: KEY,
    queryFn: fetchInbox,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function unreadCount(items: InboxItem[] | undefined): number {
  return (items ?? []).filter((n) => n.readAt === null).length;
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markRead,
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
