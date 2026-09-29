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
import { Image } from "react-native";
import { StatusBar } from "expo-status-bar";
import { signInWithPassword } from "../lib/auth";

/**
 * Shared sign-in for the KFD mobile app.
 *
 * One account serves both hats that have one: a rider signs in to the rider
 * surface, an admin/merchant sees the web-console notice. Customers have no
 * account (tracking is public by reference), so this is deliberately a bare
 * email/password screen -- no role choice, no hint that a customer should be
 * here. The role is resolved from app_users after sign-in, never chosen on
 * this page, which is the same "no silver bullet, RLS is the boundary" rule
 * the admin app uses.
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
      setError(
        cause instanceof Error ? cause.message : "Sign-in failed. Try again."
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
      <View style={styles.form}>
        {onBack ? (
          <Text style={styles.back} onPress={onBack}>
            ‹ Back
          </Text>
        ) : null}

        <Image source={require("../../assets/icon.png")} style={styles.logo} />
        <Text style={styles.title}>KFD</Text>
        <Text style={styles.subtitle}>Sign in to your KFD account</Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          editable={!submitting}
        />
        <TextInput
          style={styles.input}
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

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <SubmitButton busy={submitting} onPress={handleSubmit} />
      </View>
      <StatusBar style="dark" />
    </KeyboardAvoidingView>
  );
}

function SubmitButton({
  busy,
  onPress,
}: {
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.button, busy ? styles.buttonDisabled : null]}
      disabled={busy}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.buttonLabel}>Sign in</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
  },
  form: { padding: 24, gap: 12 },
  back: { fontSize: 15, color: "#666", alignSelf: "flex-start" },
  logo: { width: 96, height: 96, borderRadius: 20, alignSelf: "center" },
  title: { fontSize: 32, fontWeight: "800", color: "#111", textAlign: "center" },
  subtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d1d1",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111",
  },
  error: {
    fontSize: 14,
    color: "#b42318",
    textAlign: "center",
  },
  button: {
    backgroundColor: "#111",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonLabel: { fontSize: 16, fontWeight: "700", color: "#fff" },
});