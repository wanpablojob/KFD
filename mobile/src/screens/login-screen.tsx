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
 * Shared sign-in for the KFD mobile app, pixel theme to match the landing.
 *
 * One account serves both hats that have one: a rider signs in to the rider
 * surface, an admin/merchant sees the web-console notice. Customers have no
 * account (tracking is public by reference), so this is deliberately a bare
 * email/password screen -- no role choice, no hint that a customer should be
 * here. The role is resolved from app_users after sign-in, never chosen on
 * this page.
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
            ‹ BACK
          </Text>
        ) : null}

        <Image source={require("../../assets/icon.png")} style={styles.logo} />
        <Text style={styles.title}>KFD</Text>
        <Text style={styles.subtitle}>SIGN IN TO YOUR KFD ACCOUNT</Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#8aa2ff"
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
          placeholderTextColor="#8aa2ff"
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
      <StatusBar style="light" />
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
      style={({ pressed }) => [
        styles.button,
        busy ? styles.buttonDisabled : null,
        pressed && !busy ? styles.buttonPressed : null,
      ]}
      disabled={busy}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator color="#111830" />
      ) : (
        <Text style={styles.buttonLabel}>▸ SIGN IN</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1020",
    justifyContent: "center",
  },
  form: { padding: 24, gap: 12 },
  back: { fontSize: 14, letterSpacing: 2, color: "#8aa2ff", alignSelf: "flex-start" },
  logo: { width: 72, height: 72, borderWidth: 2, borderColor: "#ffd23f", alignSelf: "center" },
  title: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 6,
    color: "#ffd23f",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 12,
    letterSpacing: 2,
    color: "#8aa2ff",
    textAlign: "center",
    marginBottom: 8,
  },
  input: {
    borderWidth: 2,
    borderColor: "#3b5bdb",
    backgroundColor: "#111830",
    borderRadius: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#e5e7eb",
  },
  error: {
    fontSize: 14,
    color: "#ff8787",
    textAlign: "center",
  },
  button: {
    backgroundColor: "#ffd23f",
    borderRadius: 0,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonPressed: {
    backgroundColor: "#e6b820",
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  buttonLabel: { fontSize: 16, fontWeight: "800", letterSpacing: 2, color: "#111830" },
});