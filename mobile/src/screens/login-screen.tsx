import { useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { signInWithPassword, signInWithProvider } from "../lib/auth";
import { colors, radius, shadow, spacing, type } from "../lib/theme";

/**
 * Shared sign-in for the KFD mobile app, pixel theme to match the landing.
 *
 * One account serves every role: a rider signs in to the rider surface, a
 * customer to the storefront, an admin/merchant sees the web-console notice.
 * A customer can also sign in with Google or create an email account (the
 * /signup route). The role is resolved from app_users after sign-in, never
 * chosen on this page.
 */
export function LoginScreen({ onBack }: { onBack?: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      await signInWithPassword(trimmedEmail, password);
      // The session listener in App re-renders into the role screen.
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleProvider(provider: "google") {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await signInWithProvider(provider);
      // Cancel or completion both land in session-context; cancel keeps us here.
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Provider sign-in failed.");
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
        {onBack ? (
          <Pressable style={styles.back} onPress={onBack}>
            <Text style={styles.backLabel}>‹ BACK</Text>
          </Pressable>
        ) : null}

        <View style={styles.brand}>
          <Image source={require("../../assets/logo.png")} style={styles.logo} />
          <View>
            <Text style={styles.title}>KFD</Text>
            <Text style={styles.subtitle}>KABANKALAN FOOD DELIVERY</Text>
          </View>
        </View>

        <Text style={styles.lead}>Local food, delivered to your door</Text>

        <Field
          label="EMAIL"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          editable={!submitting}
        />
        <Field
          label="PASSWORD"
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          textContentType="password"
          autoComplete="current-password"
          editable={!submitting}
          onSubmitEditing={handleSubmit}
          returnKeyType="go"
        />

        <Link href="/forgot-password" style={styles.forgotLink}>
          <Text style={styles.forgotLabel}>Forgot password?</Text>
        </Link>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <SubmitButton busy={submitting} onPress={handleSubmit} />

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
          onPress={() => void handleProvider("google")}
        >
          <Text style={styles.providerGlyph}>G</Text>
          <Text style={styles.providerLabel}>Continue with Google</Text>
        </Pressable>

        <Link href="/signup" replace style={styles.signupLink}>
          <Text style={styles.signupLabel}>
            New here? <Text style={styles.signupLinkBold}>Create an account</Text>
          </Text>
        </Link>
      </View>
      <StatusBar style="dark" />
    </KeyboardAvoidingView>
  );
}

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

function SubmitButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        shadow.card,
        busy ? styles.buttonDisabled : null,
        !busy && pressed ? styles.buttonPressed : null,
      ]}
      disabled={busy}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator color={colors.textInverse} />
      ) : (
        <Text style={styles.buttonLabel}>SIGN IN</Text>
      )}
    </Pressable>
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
  back: { alignSelf: "flex-start" },
  backLabel: { ...type.label, color: colors.secondary },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  logo: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: 3, color: colors.primary },
  subtitle: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.textMuted,
    marginTop: 2,
  },
  lead: { ...type.body, color: colors.textMuted, marginTop: -spacing.sm },
  field: { gap: 6 },
  fieldLabel: { ...type.eyebrow, color: colors.textFaint },
  fieldLabelFocused: { color: colors.secondary },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
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
  buttonDisabled: { opacity: 0.6 },
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
  signupLink: { alignItems: "center" },
  forgotLink: { alignSelf: "flex-end", marginTop: -spacing.sm },
  forgotLabel: { ...type.caption, color: colors.primary, fontWeight: "700" },
  signupLabel: { ...type.caption, color: colors.textMuted },
  signupLinkBold: { color: colors.primary, fontWeight: "800" },
});
