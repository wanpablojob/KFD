import { useEffect, useMemo, useState } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useGlassPreferences } from "../components/GlassSurface";
import { colors, radius, spacing, type } from "../lib/theme";

/**
 * Rider on a scooter, 24x16 grid, facing right. X = body, O = wheels,
 * B = the food box on the back. Generated, not hand-typed: every row is
 * exactly 24 characters, which is what keeps the pixels aligned.
 */
const RIDER = [
  "........................",
  "..........XXXX..........",
  ".........XXXXXX.........",
  "........XXXXXXXX........",
  "........XX....XX........",
  ".BBBB..XXX...XXX........",
  ".BBBB.XXXXX..XXXXXXX....",
  ".BBBBXXXXXX..XXXXXXXX...",
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

const TRACK_W = 280;
const DRIVE_MS = 2400;
const DASH_W = 18;
const DASH_GAP = 14;

/** Playful lines that rotate under the real status message. */
const FUN_LINES = [
  "Firing up the grill…",
  "Marinating the inasal…",
  "Warming up the scooter…",
  "Toasting the piaya…",
  "Checking the shortcut through the barangay…",
  "Packing extra rice…",
];

const PIXEL_COLORS: Record<string, string> = {
  X: colors.primary,
  O: colors.primaryDark,
  B: colors.accent,
};

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
                backgroundColor: PIXEL_COLORS[px],
              }}
            />
          )
        )
      )}
    </View>
  );
}

/**
 * The cream loading screen with the pixel rider, made livelier: the rider
 * drives along a static road and loops back in from the left, bobbing and
 * puffing exhaust, the logo bounces, and a playful line
 * rotates under the real status. Everything stops under Reduce Motion.
 *
 * JS-driven animations, as before: the native animated graph crashed Expo Go
 * on the new architecture ("cannot add new property _tracking").
 */
export function LoadingScreen({ message }: { message?: string }) {
  const { reduceMotion } = useGlassPreferences();
  const [drive, hop, puff, bounce] = useMemo(
    () => [0, 1, 2, 3].map(() => new Animated.Value(0)),
    []
  );
  const [line, setLine] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const loops = [
      Animated.loop(
        Animated.timing(drive, {
          toValue: 1,
          duration: DRIVE_MS,
          easing: Easing.linear,
          useNativeDriver: false,
        })
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(hop, {
            toValue: 1,
            duration: 180,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(hop, {
            toValue: 0,
            duration: 220,
            easing: Easing.in(Easing.quad),
            useNativeDriver: false,
          }),
        ])
      ),
      Animated.loop(
        Animated.timing(puff, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        })
      ),
      Animated.loop(
        Animated.sequence([
          Animated.delay(1400),
          Animated.spring(bounce, {
            toValue: 1,
            speed: 20,
            bounciness: 14,
            useNativeDriver: false,
          }),
          Animated.timing(bounce, {
            toValue: 0,
            duration: 260,
            useNativeDriver: false,
          }),
        ])
      ),
    ];
    loops.forEach((l) => l.start());
    const ticker = setInterval(() => setLine((i) => (i + 1) % FUN_LINES.length), 1800);
    return () => {
      loops.forEach((l) => l.stop());
      clearInterval(ticker);
    };
  }, [reduceMotion, drive, hop, puff, bounce]);

  const riderX = drive.interpolate({
    inputRange: [0, 1],
    outputRange: [-RIDER_W, TRACK_W],
  });
  const riderY = hop.interpolate({ inputRange: [0, 1], outputRange: [0, -CELL] });
  const logoScale = bounce.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const logoTilt = bounce.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "-6deg"],
  });
  const dashes = Math.ceil(TRACK_W / (DASH_W + DASH_GAP)) + 1;

  return (
    <View style={styles.container}>
      <View style={styles.centerStack}>
        <Animated.View
          style={{ transform: [{ scale: logoScale }, { rotate: logoTilt }] }}
        >
          <Image source={require("../../assets/logo.png")} style={styles.logo} />
        </Animated.View>
        <Text style={styles.title}>KFD</Text>
        <Text style={styles.subtitle}>Kabankalan Food Delivery</Text>

        <View style={styles.track}>
          {/* A static road: asphalt with a dashed centre line. Only the rider moves. */}
          <View style={styles.road}>
            <View style={styles.lane}>
              {Array.from({ length: dashes }, (_, i) => (
                <View key={i} style={styles.dash} />
              ))}
            </View>
          </View>

          <Animated.View
            style={[
              styles.rider,
              { transform: [{ translateX: riderX }, { translateY: riderY }] },
            ]}
          >
            {/* Exhaust: three puffs trailing behind, each a step further back. */}
            {[0, 1, 2].map((i) => (
              <Animated.View
                key={i}
                style={[
                  styles.puff,
                  {
                    left: -8 - i * 12,
                    opacity: puff.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.55 - i * 0.15, 0],
                    }),
                    transform: [
                      {
                        scale: puff.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.6, 1.4],
                        }),
                      },
                    ],
                  },
                ]}
              />
            ))}
            <PixelRider />
          </Animated.View>
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Text style={styles.fun}>{reduceMotion ? FUN_LINES[0] : FUN_LINES[line]}</Text>
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
  centerStack: { alignItems: "center", gap: spacing.md },
  logo: { width: 96, height: 96 },
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
  track: {
    width: TRACK_W,
    height: RIDER_H + CELL * 2,
    marginTop: spacing.xl,
    overflow: "hidden",
  },
  road: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: CELL * 4,
    backgroundColor: colors.textMuted,
    borderRadius: radius.sm,
    justifyContent: "center",
  },
  lane: { flexDirection: "row", gap: DASH_GAP, paddingLeft: DASH_GAP / 2 },
  dash: { width: DASH_W, height: 3, backgroundColor: colors.gold },
  rider: { position: "absolute", left: 0, top: CELL },
  puff: {
    position: "absolute",
    top: 11 * CELL,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.textFaint,
  },
  message: {
    ...type.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: "center",
    letterSpacing: 1,
  },
  fun: {
    ...type.caption,
    color: colors.secondary,
    fontStyle: "italic",
    textAlign: "center",
  },
});
