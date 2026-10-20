import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useAnimatedValue,
  View,
  type ViewStyle,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useGlassPreferences } from "../components/GlassSurface";
import type { IconName } from "../components/tab-icons";
import { colors, radius, spacing, type } from "../lib/theme";

export type LandingAction = "login";

/**
 * Signed-out landing -- the gateway to the shared sign-in.
 *
 * Customers track orders on the web by reference; the mobile app is account
 * first, so the landing is deliberately one screen with a single decision:
 * sign in. The role is resolved from app_users after login, never chosen here.
 *
 * The background drifts: two soft colour blobs and a few small food icons, each
 * on its own slow loop so they never move in step. Transforms only, on the
 * native driver, and all of it stops under Reduce Motion.
 */
export function LandingScreen({
  onAction,
}: {
  onAction: (action: LandingAction) => void;
}) {
  const { reduceMotion } = useGlassPreferences();
  const rise = useAnimatedValue(0);

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
      { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
    ],
  };

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Drift
          still={reduceMotion}
          dx={30}
          dy={24}
          duration={9000}
          style={styles.blobTop}
        >
          <View style={[styles.blob, { backgroundColor: colors.primarySoft }]} />
        </Drift>
        <Drift
          still={reduceMotion}
          dx={-26}
          dy={-30}
          duration={11000}
          style={styles.blobBottom}
        >
          <View style={[styles.blob, { backgroundColor: colors.goldSoft }]} />
        </Drift>

        <FoodIcon
          still={reduceMotion}
          name="pizza-outline"
          top="14%"
          left="72%"
          duration={4200}
        />
        <FoodIcon
          still={reduceMotion}
          name="fast-food-outline"
          top="24%"
          left="10%"
          duration={5200}
        />
        <FoodIcon
          still={reduceMotion}
          name="cafe-outline"
          top="70%"
          left="80%"
          duration={4800}
        />
        <FoodIcon
          still={reduceMotion}
          name="bicycle-outline"
          top="80%"
          left="14%"
          duration={5600}
        />
        <FoodIcon
          still={reduceMotion}
          name="ice-cream-outline"
          top="62%"
          left="46%"
          duration={6100}
        />
      </View>

      <View style={styles.inner}>
        <Animated.View style={[styles.brand, riseStyle]}>
          <Image source={require("../../assets/logo.png")} style={styles.logo} />
          <Text style={styles.title}>KFD</Text>
          <Text style={styles.subtitle}>Kabankalan Food Delivery</Text>
        </Animated.View>

        <Animated.View style={{ opacity: rise }}>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              pressed ? styles.buttonPressed : null,
            ]}
            onPress={() => onAction("login")}
          >
            <Text style={styles.buttonLabel}>Sign in</Text>
          </Pressable>
        </Animated.View>
      </View>
      <StatusBar style="dark" />
    </View>
  );
}

/** Moves its child back and forth along (dx, dy) on an endless eased loop. */
function Drift({
  dx,
  dy,
  duration,
  still,
  style,
  children,
}: {
  dx: number;
  dy: number;
  duration: number;
  still: boolean;
  style?: ViewStyle;
  children: ReactNode;
}) {
  const t = useAnimatedValue(0);

  useEffect(() => {
    if (still) {
      t.setValue(0);
      return;
    }
    const half = (toValue: number) =>
      Animated.timing(t, {
        toValue,
        duration: duration / 2,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      });
    const loop = Animated.loop(Animated.sequence([half(1), half(0)]));
    loop.start();
    return () => loop.stop();
  }, [t, duration, still]);

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** A small, faint food icon that bobs a few points up and down. */
function FoodIcon({
  name,
  top,
  left,
  duration,
  still,
}: {
  name: IconName;
  top: `${number}%`;
  left: `${number}%`;
  duration: number;
  still: boolean;
}) {
  return (
    <Drift
      still={still}
      dx={0}
      dy={-10}
      duration={duration}
      style={{ position: "absolute", top, left }}
    >
      <Ionicons name={name} size={26} color={colors.secondary} style={styles.icon} />
    </Drift>
  );
}

const BLOB = 320;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    overflow: "hidden",
  },
  blob: { width: BLOB, height: BLOB, borderRadius: BLOB / 2, opacity: 0.8 },
  blobTop: { position: "absolute", top: -BLOB / 3, right: -BLOB / 3 },
  blobBottom: { position: "absolute", bottom: -BLOB / 3, left: -BLOB / 3 },
  icon: { opacity: 0.28 },
  inner: { padding: spacing.xl, gap: spacing.xxl },
  brand: { alignItems: "center", gap: spacing.xs },
  logo: {
    width: 88,
    height: 88,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: 4,
    color: colors.primary,
  },
  subtitle: {
    ...type.eyebrow,
    letterSpacing: 2,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  buttonPressed: {
    backgroundColor: colors.primaryDark,
    transform: [{ scale: 0.98 }],
  },
  buttonLabel: {
    ...type.heading,
    color: colors.textInverse,
    letterSpacing: 0.5,
  },
});
