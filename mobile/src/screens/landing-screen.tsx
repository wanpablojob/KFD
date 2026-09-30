import { useEffect } from "react";
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useAnimatedValue,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { colors, radius, spacing, type } from "../lib/theme";

export type LandingAction = "login";

/**
 * Signed-out pixel-theme landing -- the gateway to the shared sign-in.
 *
 * Customers track orders on the web by reference; the mobile app is account
 * first, so the landing is deliberately one screen with a single decision:
 * sign in. The role is resolved from app_users after login, never chosen here.
 *
 * Animations run on React Native's built-in Animated API (no gsap -- that is
 * DOM-only and would leave the screen static inside Expo Go). They use the JS
 * driver to avoid the new-architecture "cannot add new property _tracking"
 * crash that the native animated graph triggers on Expo Go.
 */
export function LandingScreen({
  onAction,
}: {
  onAction: (action: LandingAction) => void;
}) {
  const rise = useAnimatedValue(0);
  const blink = useAnimatedValue(0);

  useEffect(() => {
    Animated.timing(rise, {
      toValue: 1,
      duration: 600,
      useNativeDriver: false,
    }).start();

    const blinkLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(blink, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ])
    );
    blinkLoop.start();
    return () => blinkLoop.stop();
  }, [rise, blink]);

  const riseStyle = {
    opacity: rise,
    transform: [
      {
        translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }),
      },
    ],
  };
  const blinkOpacity = blink.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <Animated.View style={[styles.brand, riseStyle]}>
          <View style={styles.logoRow}>
            <Image source={require("../../assets/icon.png")} style={styles.logo} />
            <View>
              <Text style={styles.title}>KFD</Text>
              <Text style={styles.subtitle}>Kabankalan Food Delivery</Text>
            </View>
          </View>
          <Text style={styles.tagline}>PRESS ▮ TO PLAY</Text>
        </Animated.View>

        <Animated.View style={[styles.actions, { opacity: rise }]}>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed ? styles.buttonPressed : null,
            ]}
            onPress={() => onAction("login")}
          >
            <Text style={styles.buttonLabel}>▸ SIGN IN</Text>
          </Pressable>
          <Animated.Text style={[styles.hint, { opacity: blinkOpacity }]}>
            One account for every role
          </Animated.Text>
        </Animated.View>
      </View>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
  },
  inner: { padding: spacing.xl, gap: spacing.xxl },
  brand: { alignItems: "flex-start", gap: spacing.xs },
  logoRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  logo: {
    width: 72,
    height: 72,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.md,
  },
  title: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 4,
    color: colors.primary,
  },
  subtitle: {
    ...type.eyebrow,
    letterSpacing: 2,
  },
  tagline: {
    ...type.eyebrow,
    letterSpacing: 2,
    color: colors.secondary,
    borderWidth: 2,
    borderColor: colors.secondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignSelf: "flex-start",
  },
  actions: { gap: spacing.md },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
    minWidth: 200,
  },
  buttonPressed: {
    backgroundColor: colors.primaryDark,
    transform: [{ scale: 0.98 }],
  },
  buttonLabel: {
    ...type.heading,
    color: colors.textInverse,
    letterSpacing: 1,
  },
  hint: {
    ...type.caption,
    color: colors.textMuted,
    textAlign: "center",
  },
});
