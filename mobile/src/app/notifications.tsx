import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../lib/session-context";
import {
  unreadCount,
  useInbox,
  useMarkRead,
  type InboxItem,
} from "../lib/notifications";
import { pathForRoute, routeForNotification } from "../lib/notification-routing";
import { colors, radius, shadow, spacing, type } from "../lib/theme";

const when = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "5 min ago" for today's alerts, a date for older ones. */
function timeLabel(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return when.format(new Date(iso));
}

/**
 * The inbox: every alert this account received, newest first, unread ones
 * tinted. Tapping one marks it read and opens what it is about, exactly as
 * tapping the push would have.
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { role } = useSession();
  const inbox = useInbox();
  const markRead = useMarkRead();
  const items = inbox.data ?? [];
  const unread = unreadCount(items);

  function open(item: InboxItem) {
    if (!item.readAt) markRead.mutate([item.id]);
    const route = routeForNotification(item.data, role?.role ?? null);
    if (route) router.push(pathForRoute(route) as never);
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.top, { paddingTop: spacing.lg + insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <Pressable
          disabled={unread === 0 || markRead.isPending}
          onPress={() =>
            markRead.mutate(items.filter((n) => !n.readAt).map((n) => n.id))
          }
          accessibilityRole="button"
        >
          <Text style={[styles.markAll, unread === 0 && styles.markAllOff]}>
            Mark all read
          </Text>
        </Pressable>
      </View>

      {inbox.isPending ? (
        <ActivityIndicator style={styles.center} color={colors.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + spacing.xl },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={inbox.isRefetching}
              onRefresh={() => void inbox.refetch()}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons
                name="notifications-off-outline"
                size={44}
                color={colors.textFaint}
              />
              <Text style={type.heading}>
                {inbox.isError
                  ? "Could not load notifications"
                  : "No notifications yet"}
              </Text>
              <Text style={[type.caption, styles.emptyText]}>
                {inbox.isError
                  ? "Pull down to try again."
                  : "Order updates and alerts will appear here."}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => open(item)}
              style={({ pressed }) => [
                styles.item,
                shadow.card,
                !item.readAt && styles.itemUnread,
                pressed && styles.itemPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${item.readAt ? "" : "Unread. "}${item.title}. ${item.body}`}
            >
              <View style={[styles.dot, !item.readAt && styles.dotOn]} />
              <View style={styles.copy}>
                <Text style={[type.label, styles.itemTitle]}>{item.title}</Text>
                <Text style={type.body}>{item.body}</Text>
                <Text style={type.caption}>{timeLabel(item.createdAt)}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { ...type.title, flex: 1 },
  markAll: { ...type.caption, color: colors.primary, fontWeight: "700" },
  markAllOff: { color: colors.textFaint },
  center: { marginTop: spacing.xxl },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  item: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  itemUnread: { backgroundColor: colors.goldSoft },
  itemPressed: { opacity: 0.7 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  dotOn: { backgroundColor: colors.primary },
  copy: { flex: 1, gap: 2 },
  itemTitle: { color: colors.text },
  empty: { alignItems: "center", gap: spacing.sm, marginTop: spacing.xxl * 2 },
  emptyText: { textAlign: "center" },
});
