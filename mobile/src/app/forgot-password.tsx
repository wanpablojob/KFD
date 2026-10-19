import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Link } from "expo-router";
import { requestPasswordReset, resetPasswordWithCode } from "../lib/auth";
import { resetFormError } from "../lib/password-reset";
import { colors, radius, shadow, spacing, type } from "../lib/theme";

/**
 * Forgot password: email -> 6-digit code -> new password, all on this screen.
 *
 * A code rather than a link on purpose. Verifying it signs the user in, and the
 * root navigator then swaps to their role's surface; with a link the reset
 * screen would be torn down by that swap halfway through. Here the password is
 * set in the same call, so the swap is simply where they land.
 */
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function run(action: () => Promise<void>) {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Something went wrong. Try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function sendCode() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter the email you signed up with.");
      return;
    }
    void run(async () => {
      await requestPasswordReset(trimmed);
      setSent(true);
    });
  }

  function reset() {
    const problem = resetFormError(code, password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    // On success the session listener moves the user to their home screen.
    void run(() => resetPasswordWithCode(email.trim(), code.trim(), password));
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.frame}>
        <Link href="/login" replace>
          <Text style={styles.back}>‹ BACK</Text>
        </Link>

        <View>
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.subtitle}>
            {sent
              ? `We sent a 6-digit code to ${email.trim()}. It may take a minute.`
              : "We will email you a code to set a new password."}
          </Text>
        </View>

        {!sent ? (
          <Field
            label="EMAIL"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            autoComplete="email"
            editable={!submitting}
            onSubmitEditing={sendCode}
            returnKeyType="send"
          />
        ) : (
          <>
            <Field
              label="CODE"
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              editable={!submitting}
            />
            <Field
              label="NEW PASSWORD"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              secureTextEntry
              textContentType="newPassword"
              autoComplete="new-password"
              editable={!submitting}
            />
            <Field
              label="CONFIRM PASSWORD"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Re-enter password"
              secureTextEntry
              textContentType="newPassword"
              autoComplete="new-password"
              editable={!submitting}
              onSubmitEditing={reset}
              returnKeyType="go"
            />
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            shadow.card,
            pressed ? styles.buttonPressed : null,
          ]}
          onPress={sent ? reset : sendCode}
          disabled={submitting}
          accessibilityRole="button"
        >
          {submitting ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.buttonLabel}>
              {sent ? "SET NEW PASSWORD" : "SEND CODE"}
            </Text>
          )}
        </Pressable>

        {sent ? (
          <Pressable
            onPress={sendCode}
            disabled={submitting}
            accessibilityRole="button"
          >
            <Text style={styles.resend}>Send the code again</Text>
          </Pressable>
        ) : null}
      </View>
      <StatusBar style="dark" />
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  ...inputProps
}: { label: string } & Omit<
  React.ComponentProps<typeof TextInput>,
  "style" | "placeholderTextColor" | "onFocus" | "onBlur"
>) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, focused && styles.fieldLabelFocused]}>
        {label}
      </Text>
      <TextInput
        {...inputProps}
        style={[styles.input, focused && styles.inputFocused]}
        placeholderTextColor={colors.textFaint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: "center" },
  frame: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    gap: spacing.lg,
  },
  back: { ...type.label, color: colors.secondary },
  title: { fontSize: 26, fontWeight: "800", color: colors.text },
  subtitle: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  field: { gap: 6 },
  fieldLabel: { ...type.eyebrow, color: colors.textFaint },
  fieldLabelFocused: { color: colors.secondary },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  inputFocused: { borderColor: colors.secondary, backgroundColor: colors.card },
  error: { ...type.body, color: colors.danger, textAlign: "center" },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  buttonPressed: { backgroundColor: colors.primaryDark },
  buttonLabel: { fontSize: 16, fontWeight: "800", color: colors.textInverse },
  resend: {
    ...type.caption,
    color: colors.primary,
    fontWeight: "700",
    textAlign: "center",
  },
});
