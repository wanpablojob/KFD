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
import { signUpWithEmail, signInWithProvider } from "../lib/auth";
import { collapseAuthError } from "../lib/auth-errors";
import { colors, radius, shadow, spacing, type } from "../lib/theme";

function Field({
  label,
  ...inputProps
}: {
  label: string;
} & Omit<
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

/**
 * Customer self sign-up. After a successful email/password signUp the session
 * auto-embraces the customer role (register_customer in session-context), so
 * this screen needs no role hint. If Supabase holds the account for email
 * confirmation, a message is shown instead and the user signs in after
 * confirming.
 */
export default function SignUpScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);
    setInfo(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Enter an email and password.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const data = await signUpWithEmail(trimmedEmail, password);
      if (!data.session) {
        setInfo(
          "Check your inbox to confirm your email, then sign in. (OTP email may take a minute.)"
        );
      }
      // On the session path the auto-register in session-context guides us.
    } catch (cause) {
      setError(
        cause instanceof Error
          ? (collapseAuthError(cause.message) ?? cause.message)
          : "Sign-up failed. Try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await signInWithProvider("google");
      if (!result) {
        // User cancelled the provider flow
        setSubmitting(false);
        return;
      }
      // Session established; session-context auto-registers customer
    } catch (cause) {
      setError(
        cause instanceof Error
          ? (collapseAuthError(cause.message) ?? cause.message)
          : "Google sign-up failed. Try again."
      );
    } finally {
      setSubmitting(false);
    }
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
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Order from any place in Kabankalan</Text>
        </View>

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
        />
        <Field
          label="PASSWORD"
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
          onSubmitEditing={handleSubmit}
          returnKeyType="go"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {info ? <Text style={styles.info}>{info}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            shadow.card,
            pressed ? styles.buttonPressed : null,
          ]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.buttonLabel}>CREATE ACCOUNT</Text>
          )}
        </Pressable>

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>OR</Text>
          <View style={styles.orLine} />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.providerButton,
            shadow.card,
            pressed ? styles.providerPressed : null,
          ]}
          disabled={submitting}
          onPress={handleGoogle}
        >
          <Text style={styles.providerGlyph}>G</Text>
          <Text style={styles.providerLabel}>Continue with Google</Text>
        </Pressable>

        <Link href="/login" replace style={styles.signupLink}>
          <Text style={styles.signupLabel}>
            Already have an account? <Text style={styles.signupLinkBold}>Sign in</Text>
          </Text>
        </Link>
      </View>
      <StatusBar style="dark" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
  },
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
  info: { ...type.body, color: colors.secondary, textAlign: "center" },
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
  orRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.textFaint,
  },
  providerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  providerPressed: { backgroundColor: colors.surface },
  providerGlyph: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.primary,
  },
  providerLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  signupLink: { alignItems: "center", marginTop: spacing.sm },
  signupLabel: { ...type.caption, color: colors.textMuted },
  signupLinkBold: { color: colors.primary, fontWeight: "800" },
});
