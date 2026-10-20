import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useAnimatedValue,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { signInWithProvider } from "../lib/auth";
import { collapseAuthError } from "../lib/auth-errors";
import { colors, radius, shadow, spacing, type } from "../lib/theme";

export type LandingAction = "login" | "signup" | "track";

/**
 * Signed-out landing: what KFD is, and one obvious way in.
 *
 * A food photo under a red band carries the brand; the cream sheet below asks
 * one question (new or returning?) with Google as the fastest path. Tracking
 * works without an account, so it is offered too. The role is resolved from
 * app_users after sign-in, never chosen here.
 */
export function LandingScreen({
  onAction,
}: {
  onAction: (action: LandingAction) => void;
}) {
  const insets = useSafeAreaInsets();
  const rise = useAnimatedValue(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Animated.timing(rise, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [rise]);

  const riseStyle = {
    opacity: rise,
    transform: [
      { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
    ],
  };

  async function google() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await signInWithProvider("google");
      // Success and cancel both land in the session listener; cancel stays here.
    } catch (cause) {
      setError(
        cause instanceof Error
          ? (collapseAuthError(cause.message) ?? cause.message)
          : "Google sign-in failed. Try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <ImageBackground
          source={require("../../assets/landing-food.jpg")}
          style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}
          imageStyle={styles.heroImage}
          accessibilityLabel="A plate of chicken inasal with rice"
        >
          <View style={styles.heroShade} />
          <Animated.View style={[styles.brand, riseStyle]}>
            <Image source={require("../../assets/logo.png")} style={styles.logo} />
            <Text style={styles.title}>KFD</Text>
            <Text style={styles.subtitle}>Kabankalan Food Delivery</Text>
          </Animated.View>
        </ImageBackground>

        <Animated.View style={[styles.sheet, riseStyle]}>
          {/* TODO(owner): a Hiligaynon line here, written by a native speaker. */}
          <Text style={styles.headline}>Local kitchens, delivered to your door.</Text>
          <Text style={styles.lead}>
            Order from Kabankalan restaurants, pay cash or GCash when it arrives, and
            follow every step of your order.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => onAction("signup")}
            style={({ pressed }) => [
              styles.primary,
              shadow.card,
              pressed && styles.primaryPressed,
            ]}
          >
            <Text style={styles.primaryLabel}>Create an account</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => void google()}
            disabled={busy}
            style={({ pressed }) => [styles.google, pressed && styles.googlePressed]}
          >
            {busy ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Ionicons name="logo-google" size={18} color={colors.primary} />
                <Text style={styles.googleLabel}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => onAction("login")}
            style={styles.textButton}
          >
            <Text style={styles.textButtonLabel}>
              Already have an account? <Text style={styles.bold}>Sign in</Text>
            </Text>
          </Pressable>

          <View style={styles.links}>
            <Pressable
              onPress={() => onAction("track")}
              accessibilityRole="link"
              hitSlop={8}
              style={styles.link}
            >
              <Ionicons name="navigate-outline" size={16} color={colors.secondary} />
              <Text style={styles.linkLabel}>Track an order</Text>
            </Pressable>
            <Pressable
              onPress={() => onAction("signup")}
              accessibilityRole="link"
              hitSlop={8}
              style={styles.link}
            >
              <Ionicons name="bicycle-outline" size={16} color={colors.secondary} />
              <Text style={styles.linkLabel}>Ride with KFD</Text>
            </Pressable>
          </View>
          <Text style={styles.riderHint}>
            Riders: create an account, then tap Apply to deliver in Account.
          </Text>

          {/* CC BY-SA 4.0 asks for the author and licence beside the photo. */}
          <Text style={styles.credit}>Photo: Ralff Nestor Nacor, CC BY-SA 4.0</Text>
        </Animated.View>
      </ScrollView>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1 },
  hero: {
    minHeight: 320,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: spacing.xxl + spacing.lg,
  },
  heroImage: { resizeMode: "cover" },
  // The brand red over the photo, so the badge reads on any part of the image.
  heroShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.primary,
    opacity: 0.72,
  },
  brand: { alignItems: "center", gap: spacing.xs },
  logo: { width: 104, height: 104, marginBottom: spacing.sm },
  title: {
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: 5,
    color: colors.textInverse,
  },
  subtitle: {
    ...type.eyebrow,
    letterSpacing: 2,
    color: colors.goldSoft,
    textTransform: "uppercase",
  },
  sheet: {
    flex: 1,
    marginTop: -spacing.xl,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  headline: { ...type.display, fontSize: 26 },
  lead: {
    ...type.body,
    color: colors.textMuted,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryPressed: { backgroundColor: colors.primaryDark },
  primaryLabel: { ...type.heading, color: colors.textInverse },
  google: {
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 50,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  googlePressed: { backgroundColor: colors.surface },
  googleLabel: { ...type.label, color: colors.text, fontWeight: "700" },
  error: { ...type.body, color: colors.danger, textAlign: "center" },
  textButton: { alignItems: "center", paddingVertical: spacing.sm },
  textButtonLabel: { ...type.body, color: colors.textMuted },
  bold: { color: colors.primary, fontWeight: "800" },
  links: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xl,
    marginTop: spacing.sm,
  },
  link: { flexDirection: "row", alignItems: "center", gap: 6 },
  linkLabel: { ...type.label, color: colors.secondary },
  riderHint: { ...type.caption, color: colors.textFaint, textAlign: "center" },
  credit: {
    fontSize: 10,
    color: colors.textFaint,
    textAlign: "center",
    marginTop: "auto",
  },
});
