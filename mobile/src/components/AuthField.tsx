import Ionicons from "@expo/vector-icons/Ionicons";
import { useState, type ComponentProps } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, spacing, type } from "../lib/theme";

/**
 * The labelled input shared by login, sign-up and password reset. A password
 * field (secureTextEntry) gets an eye button to show what was typed, since a
 * mistyped password on a phone keyboard is the most common sign-in failure.
 */
export function AuthField({
  label,
  secureTextEntry,
  ...inputProps
}: { label: string } & Omit<
  ComponentProps<typeof TextInput>,
  "style" | "placeholderTextColor" | "onFocus" | "onBlur"
>) {
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.label, focused && styles.labelFocused]}>{label}</Text>
      <View style={[styles.box, focused && styles.boxFocused]}>
        <TextInput
          {...inputProps}
          secureTextEntry={secureTextEntry && !shown}
          style={styles.input}
          placeholderTextColor={colors.textFaint}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setShown((s) => !s)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={shown ? "Hide password" : "Show password"}
          >
            <Ionicons
              name={shown ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={colors.textFaint}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { ...type.label, color: colors.textMuted },
  labelFocused: { color: colors.secondary },
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  boxFocused: { borderColor: colors.secondary, backgroundColor: colors.card },
  input: { flex: 1, paddingVertical: spacing.md, fontSize: 15, color: colors.text },
});
