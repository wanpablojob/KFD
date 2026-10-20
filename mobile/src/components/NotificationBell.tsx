import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { unreadCount, useInbox } from "../lib/notifications";
import { colors, radius } from "../lib/theme";

/** The bell in each surface's header: opens the inbox, red count when unread. */
export function NotificationBell() {
  const router = useRouter();
  const { data } = useInbox();
  const unread = unreadCount(data);
  return (
    <Pressable
      onPress={() => router.push("/notifications")}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={
        unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
      }
      style={styles.bell}
    >
      <Ionicons
        name={unread > 0 ? "notifications" : "notifications-outline"}
        size={24}
        color={colors.text}
      />
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
            {unread > 9 ? "9+" : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: { padding: 4 },
  badge: {
    position: "absolute",
    top: 0,
    right: -2,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: colors.textInverse },
});
