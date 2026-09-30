import { useEffect, useMemo } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { colors, radius, spacing, type } from "../lib/theme";

/**
 * Rider on a scooter, 24x16 grid, facing right. X = body, O = wheels.
 * Generated, not hand-typed: an earlier hand-drawn version had rows of 23/24/25
 * chars, which is exactly what made the orbit art look misaligned.
 * Wheel contact row is 13, so the bar's top edge sits at that row.
 */
const RIDER = [
  "........................",
  "..........XXXX..........",
  ".........XXXXXX.........",
  "........XXXXXXXX........",
  "........XX....XX........",
  ".......XXX...XXX........",
  "......XXXXX..XXXXXXX....",
  ".....XXXXXX..XXXXXXXX...",
  "......XXXXX...XXXXX.....",
  ".......XXXX....XXXX.....",
  "....XXXXXXXXXXXXXXXX....",
  "..OOOOOXXXXXXXXXXOOOOO..",
  "..OOOOO..........OOOOO..",
  "...OOO............OOO...",
  "........................",
  "........................",
];

const COLS = 24;
const ROWS = 16;
/** Integer cell size: fractional edges rasterize into blur. */
const CELL = 5;
const RIDER_W = COLS * CELL;
const RIDER_H = ROWS * CELL;
const CONTACT_ROW = 13;

const BAR_W = 232;
const BAR_H = CELL;
const TRACK = BAR_W + RIDER_W;
const DURATION = 2600;

function PixelRider() {
  return (
    <View style={{ width: RIDER_W, height: RIDER_H }}>
      {RIDER.flatMap((row, y) =>
        row.split("").map((px, x) =>
          px === "." ? null : (
            <View
              key={`${x}-${y}`}
              style={{
                position: "absolute",
                left: x * CELL,
                top: y * CELL,
                width: CELL,
                height: CELL,
                backgroundColor: px === "O" ? colors.primaryDark : colors.primary,
              }}
            />
          )
        )
      )}
    </View>
  );
}

export function LoadingScreen({ message }: { message?: string }) {
  const [x, hop] = useMemo(
    () => [new Animated.Value(0), new Animated.Value(0)] as const,
    []
  );

  useEffect(() => {
    const travel = Animated.loop(
      Animated.sequence([
        Animated.timing(x, {
          toValue: 1,
          duration: DURATION,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
        Animated.timing(x, {
          toValue: 0,
          duration: DURATION,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
      ])
    );
    travel.start();

    // DVD-style bounce: wheels leave the bar on each pass.
    const bounce = Animated.loop(
      Animated.sequence([
        Animated.timing(hop, {
          toValue: 1,
          duration: DURATION / 4,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(hop, {
          toValue: 0,
          duration: (DURATION / 4) * 3,
          easing: Easing.bounce,
          useNativeDriver: false,
        }),
      ])
    );
    bounce.start();

    return () => {
      travel.stop();
      bounce.stop();
    };
  }, [x, hop]);

  const translateX = x.interpolate({
    inputRange: [0, 1],
    outputRange: [0, TRACK],
  });
  // Easing.bounce already lands the hops; one hop value drives the whole lift.
  const lift = hop.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -CELL * 2],
  });
  // Bar sits under the wheels and follows the rider's hop, so the wheels never
  // separate from the track mid-bounce.
  const barY = Animated.add(CONTACT_ROW * CELL + CELL, lift);

  return (
    <View style={styles.container}>
      <View style={styles.centerStack}>
        <Image source={require("../../assets/icon.png")} style={styles.logo} />
        <Text style={styles.title}>KFD</Text>
        <Text style={styles.subtitle}>Kabankalan Food Delivery</Text>

        <View style={styles.track}>
          <Animated.View
            style={[
              styles.bar,
              { width: BAR_W, transform: [{ translateX }, { translateY: barY }] },
            ]}
          />
          <Animated.View
            style={[
              styles.rider,
              { transform: [{ translateX }, { translateY: lift }] },
            ]}
          >
            <PixelRider />
          </Animated.View>
        </View>

        {message && <Text style={styles.message}>{message}</Text>}
      </View>

      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  centerStack: {
    alignItems: "center",
    gap: spacing.md,
  },
  track: {
    width: TRACK,
    height: RIDER_H,
    marginTop: spacing.xl,
  },
  bar: {
    position: "absolute",
    left: 0,
    height: BAR_H,
    backgroundColor: colors.primary,
    borderRadius: 0,
  },
  rider: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  logo: {
    width: 96,
    height: 96,
    borderWidth: 4,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
  },
  title: {
    ...type.display,
    fontSize: 42,
    fontWeight: "900",
    color: colors.primary,
    letterSpacing: 5,
    textShadowColor: colors.primaryDark,
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 6,
  },
  subtitle: {
    ...type.eyebrow,
    color: colors.secondary,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  message: {
    ...type.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: "center",
    letterSpacing: 1,
  },
});
