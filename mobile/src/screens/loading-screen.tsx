import { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";

/**
 * Branded pixel-theme loading screen shown while the app restores the session
 * or resolves the signed-in user's role. Uses only React Native's built-in
 * Animated API (no gsap -- that is DOM-only and cannot run inside Expo Go) so
 * the animation plays in the actual mobile app, not just the web build.
 */
export function LoadingScreen({ message }: { message?: string }) {
  const bounce = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loops = [
      Animated.loop(
        Animated.sequence([
          Animated.timing(bounce, {
            toValue: 1,
            duration: 520,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(bounce, {
            toValue: 0,
            duration: 520,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 950,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 950,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(blink, {
            toValue: 1,
            duration: 480,
            useNativeDriver: true,
          }),
          Animated.timing(blink, {
            toValue: 0,
            duration: 480,
            useNativeDriver: true,
          }),
        ])
      ),
    ];
    for (const loop of loops) loop.start();
    return () => {
      for (const loop of loops) loop.stop();
    };
  }, [bounce, pulse, blink]);

  const translateY = bounce.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });
  const barScaleX = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] });
  const blinkOpacity = blink.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] });

  return (
    <View style={styles.container}>
      <View style={styles.frame}>
        <Image source={require("../../assets/icon.png")} style={styles.logo} />
        <Text style={styles.title}>KFD</Text>
        <Text style={styles.subtitle}>Kabankalan City Proper</Text>

        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressBar,
              { transform: [{ scaleX: barScaleX }] },
            ]}
          />
        </View>

        <Animated.View
          style={[styles.block, { opacity: blinkOpacity, transform: [{ translateY }] }]}
        >
          <Text style={styles.blockGlyph}>■</Text>
        </Animated.View>

        <Animated.Text style={[styles.message, { opacity: blinkOpacity }]}>
          {message ?? "LOADING"}
        </Animated.Text>
      </View>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0b1020",
    padding: 24,
  },
  frame: {
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#3b5bdb",
    backgroundColor: "#111830",
    paddingHorizontal: 40,
    paddingVertical: 36,
  },
  logo: {
    width: 72,
    height: 72,
    borderWidth: 2,
    borderColor: "#ffd23f",
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 6,
    color: "#ffd23f",
    marginTop: 14,
  },
  subtitle: {
    fontSize: 12,
    letterSpacing: 2,
    color: "#8aa2ff",
    marginTop: 2,
    textTransform: "uppercase",
  },
  progressTrack: {
    width: 200,
    height: 12,
    borderWidth: 2,
    borderColor: "#3b5bdb",
    marginTop: 28,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  progressBar: {
    height: 8,
    backgroundColor: "#ffd23f",
    alignSelf: "flex-start",
  },
  block: { marginTop: 22 },
  blockGlyph: { color: "#8aa2ff", fontSize: 20 },
  message: {
    fontSize: 13,
    letterSpacing: 3,
    color: "#e5e7eb",
    marginTop: 4,
    textAlign: "center",
  },
});