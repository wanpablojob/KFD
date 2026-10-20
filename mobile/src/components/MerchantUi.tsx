import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScrollBottomPadding } from "./TabBarInset";
import { colors, radius, shadow, spacing, type } from "../lib/theme";
import { NotificationBell } from "./NotificationBell";

/** One merchant tab: a scrolling page with a title, pull-to-refresh and room for the tab bar. */
export function MerchantScreen({
  title,
  subtitle,
  refreshing = false,
  onRefresh,
  children,
}: {
  title: string;
  subtitle?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const bottomPadding = useScrollBottomPadding();
  return (
    <View style={ui.container}>
      <ScrollView
        contentContainerStyle={[
          ui.content,
          { paddingTop: spacing.lg + insets.top, paddingBottom: bottomPadding },
        ]}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          ) : undefined
        }
      >
        <View style={ui.headerRow}>
          <View style={ui.header}>
            <Text style={ui.title}>{title}</Text>
            {subtitle ? <Text style={ui.subtitle}>{subtitle}</Text> : null}
          </View>
          <NotificationBell />
        </View>
        {children}
      </ScrollView>
      <StatusBar style="dark" />
    </View>
  );
}

export function MerchantSection({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <View style={ui.section}>
      {label ? <Text style={ui.sectionLabel}>{label}</Text> : null}
      {children}
    </View>
  );
}

export function MerchantButton({
  label,
  onPress,
  tone = "primary",
  busy = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  tone?: "primary" | "outline" | "danger";
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        ui.button,
        tone === "primary"
          ? ui.buttonPrimary
          : tone === "danger"
            ? ui.buttonDanger
            : ui.buttonOutline,
        (pressed || disabled) && ui.buttonDim,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          color={tone === "primary" ? colors.textInverse : colors.primary}
          size="small"
        />
      ) : (
        <Text
          style={[
            ui.buttonLabel,
            tone === "primary"
              ? ui.labelInverse
              : tone === "danger"
                ? ui.labelDanger
                : ui.labelPrimary,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function MerchantLoading({ message = "Loading…" }: { message?: string }) {
  return (
    <View style={[ui.container, ui.center]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={type.caption}>{message}</Text>
    </View>
  );
}

export const ui = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  content: { padding: spacing.lg, gap: spacing.lg },
  header: { gap: spacing.xs, flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  title: { ...type.display, fontSize: 26 },
  subtitle: { ...type.caption, color: colors.textMuted },
  section: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  sectionLabel: { ...type.eyebrow, color: colors.secondary },
  body: { ...type.body },
  muted: { ...type.caption, color: colors.textMuted },
  error: { ...type.body, color: colors.danger },
  button: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonOutline: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.card,
  },
  buttonDanger: {
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.card,
  },
  buttonDim: { opacity: 0.6 },
  buttonLabel: { fontSize: 14, fontWeight: "700" },
  labelInverse: { color: colors.textInverse },
  labelPrimary: { color: colors.primary },
  labelDanger: { color: colors.danger },
});
