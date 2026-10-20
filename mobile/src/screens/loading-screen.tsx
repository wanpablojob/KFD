import { useEffect } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  useAnimatedValue,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { colors, spacing, type } from "../lib/theme";

/**
 * Brand loading screen, foodpanda-style: the logo alone on full-bleed brand red.
 *
 * It continues the native splash (app.json: same red, same logo at 200pt,
 * centred), so the handoff is invisible. The logo then gives one pop and a
 * slow pulse while the session or role loads. Reduce Motion keeps it still.
 */
const LOGO = 200;

export function LoadingScreen({ message }: { message?: string }) {
  const pop = useAnimatedValue(1);
  const fade = useAnimatedValue(0);

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    Animated.timing(fade, {
      toValue: 1,
      duration: 300,
      delay: 200,
      useNativeDriver: true,
    }).start();

    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.sequence([
        Animated.spring(pop, {
          toValue: 1.12,
          speed: 14,
          bounciness: 12,
          useNativeDriver: true,
        }),
        Animated.spring(pop, {
          toValue: 1,
          speed: 14,
          bounciness: 8,
          useNativeDriver: true,
        }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(pop, {
              toValue: 1.05,
              duration: 700,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(pop, {
              toValue: 1,
              duration: 700,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ])
        ),
      ]);
      loop.start();
    });
    return () => loop?.stop();
  }, [pop, fade]);

  return (
    <View style={styles.container} accessibilityLabel={message ?? "Loading"}>
      <Animated.Image
        source={require("../../assets/logo.png")}
        style={[styles.logo, { transform: [{ scale: pop }] }]}
        accessibilityIgnoresInvertColors
      />
      {message ? (
        <Animated.Text style={[styles.message, { opacity: fade }]}>
          {message}
        </Animated.Text>
      ) : (
        <Text style={styles.message}> </Text>
      )}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  logo: { width: LOGO, height: LOGO },
  // Absolutely placed below centre, so the logo sits exactly where the native
  // splash left it whether or not there is a message.
  message: {
    ...type.caption,
    position: "absolute",
    bottom: "22%",
    color: colors.textInverse,
    opacity: 0.85,
    letterSpacing: 1,
    paddingHorizontal: spacing.lg,
    textAlign: "center",
  },
});
