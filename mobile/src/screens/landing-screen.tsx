import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";

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
  const rise = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(0)).current;

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
              <Text style={styles.subtitle}>
                Kabankalan City Proper food delivery
              </Text>
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
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1020",
    justifyContent: "center",
  },
  inner: { padding: 32, gap: 56 },
  brand: { alignItems: "flex-start", gap: 8 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  logo: {
    width: 72,
    height: 72,
    borderWidth: 2,
    borderColor: "#ffd23f",
  },
  title: {
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: 6,
    color: "#ffd23f",
  },
  subtitle: {
    fontSize: 12,
    letterSpacing: 1.5,
    color: "#8aa2ff",
    textTransform: "uppercase",
  },
  tagline: {
    fontSize: 12,
    letterSpacing: 3,
    color: "#ff8787",
    borderWidth: 2,
    borderColor: "#ff8787",
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  actions: { gap: 16 },
  button: {
    borderWidth: 2,
    borderColor: "#ffd23f",
    backgroundColor: "#111830",
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonPressed: {
    backgroundColor: "#1c2a5e",
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 2,
    color: "#ffd23f",
  },
  hint: {
    fontSize: 12,
    letterSpacing: 2,
    color: "#8aa2ff",
    textAlign: "center",
    textTransform: "uppercase",
  },
});