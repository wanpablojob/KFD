import { BlurView, type BlurMethod } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useEffect, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Keyboard,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, radius } from "../lib/theme";

/**
 * The frosted material shared by the floating tab bar and the cart pill.
 *
 * WHICH PATH EACH DEVICE TAKES
 *
 *   iOS 26+ (isLiquidGlassAvailable)  -> expo-glass-effect GlassView, the native
 *                                        material. No scrim on top: the system
 *                                        handles legibility, and a cream wash
 *                                        over it would hide the effect.
 *   iOS < 26                          -> expo-blur BlurView + a warm cream scrim.
 *   Android 12+ (API 31+)             -> expo-blur with blurMethod
 *                                        'dimezisBlurViewSdk31Plus' + the scrim.
 *                                        expo-blur's default on Android is 'none',
 *                                        a translucent view with NO blur.
 *   Android < 12                      -> no blur view at all, a near-opaque cream.
 *                                        'dimezisBlurViewSdk31Plus' silently becomes
 *                                        'none' there, and a translucent bar with no
 *                                        blur behind it reads as a rendering fault.
 *   Reduce Transparency (iOS setting) -> solid colors.card, same border and
 *                                        shadow, no blur, on every iOS version.
 */

/* ------------------------------------------------------------------ *
 * === TWEAK: MATERIAL ===
 * Every number that decides how the glass looks is in this block.
 * ------------------------------------------------------------------ */

/** Blur strength for BlurView. Above ~40 costs frames while a list scrolls under it. */
const BLUR_INTENSITY = 28;
const ANDROID_BLUR_METHOD: BlurMethod = "dimezisBlurViewSdk31Plus";

/** Warm cream over a real blur: colors.background (#FFF8E7) at 76%. Never cool white. */
const SCRIM = "rgba(255, 248, 231, 0.76)";
/** Where there is no blur behind it: the same cream, nearly opaque. */
const SCRIM_SOLID = "rgba(255, 248, 231, 0.94)";
/** Tint handed to the native iOS 26 material. Light, so the glass still reads as glass. */
const NATIVE_TINT = "rgba(255, 248, 231, 0.30)";
/** colors.border (#EBD9B8) at 85%: a warm hairline, so the edge holds on a light page. */
const BORDER = "rgba(235, 217, 184, 0.85)";
/**
 * colors.shadow (#9E5C28), low and wide. boxShadow rather than shadow* plus
 * elevation: Android's elevation shadow is drawn from the view's background, so
 * under a translucent bar it shows through as a brown smudge. An outset
 * boxShadow is only painted outside the edge, on both platforms.
 */
const SHADOW = "0px 6px 18px rgba(158, 92, 40, 0.22)";

export type GlassPath = "native" | "blur" | "solid";

const androidCanBlur = Platform.OS === "android" && Number(Platform.Version) >= 31;

export function glassPath(prefs: GlassPreferences): GlassPath {
  if (prefs.reduceTransparency) return "solid";
  if (Platform.OS === "ios") return prefs.nativeGlass ? "native" : "blur";
  if (Platform.OS === "android") return androidCanBlur ? "blur" : "solid";
  return "blur";
}

/* ------------------------------------------------------------------ *
 * Accessibility and capability preferences
 * ------------------------------------------------------------------ */

export interface GlassPreferences {
  reduceTransparency: boolean;
  reduceMotion: boolean;
  /** The native iOS 26 material is available on this device. */
  nativeGlass: boolean;
}

/**
 * Reduce Transparency, Reduce Motion and native-glass support, kept live.
 *
 * The two AccessibilityInfo queries return Promises. Reading them synchronously
 * hands setState a Promise object, which is truthy, and every device then
 * renders as if both settings were on. The change events carry the new value,
 * so they set it directly.
 */
export function useGlassPreferences(): GlassPreferences {
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  // A synchronous capability check, so it can seed state without an effect.
  const [nativeGlass] = useState(
    () => Platform.OS === "ios" && isLiquidGlassAvailable()
  );

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((on) => mounted && setReduceTransparency(on))
      .catch(() => {});
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => mounted && setReduceMotion(on))
      .catch(() => {});
    const a = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setReduceTransparency
    );
    const b = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion
    );
    return () => {
      mounted = false;
      a.remove();
      b.remove();
    };
  }, []);

  return { reduceTransparency, reduceMotion, nativeGlass };
}

/**
 * True while the software keyboard is up.
 *
 * Android resizes the window for the keyboard (Expo's default
 * softwareKeyboardLayoutMode), so anything pinned to the bottom of the screen
 * rides up and sits on top of the keyboard. iOS uses the "will" events so the
 * bar leaves with the keyboard rather than after it.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hide = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const a = Keyboard.addListener(show, () => setVisible(true));
    const b = Keyboard.addListener(hide, () => setVisible(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return visible;
}

/* ------------------------------------------------------------------ *
 * The surface
 * ------------------------------------------------------------------ */

/**
 * A rounded glass panel. The shadow lives on the outer view and the blur on an
 * inner one: the blur has to clip its own overflow or it bleeds past the
 * corners, and a view that clips cannot also cast a shadow.
 */
export function GlassSurface({
  prefs,
  style,
  children,
}: {
  prefs: GlassPreferences;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const path = glassPath(prefs);

  return (
    <View style={[styles.shadow, style]}>
      <View
        style={[
          styles.clip,
          path === "solid" && prefs.reduceTransparency && styles.card,
        ]}
      >
        {path === "native" ? (
          <GlassView
            glassEffectStyle="regular"
            tintColor={NATIVE_TINT}
            colorScheme="light"
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {path === "blur" ? (
          <BlurView
            intensity={BLUR_INTENSITY}
            tint="light"
            {...(Platform.OS === "android" ? { blurMethod: ANDROID_BLUR_METHOD } : {})}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {/* The warm scrim. Without it the bar is see-through to whatever order
            text is passing behind it, and "glass" becomes "unreadable". */}
        {path !== "native" && !prefs.reduceTransparency ? (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: path === "blur" ? SCRIM : SCRIM_SOLID },
            ]}
          />
        ) : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: radius.pill,
    boxShadow: SHADOW,
  },
  clip: {
    flex: 1,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    overflow: "hidden",
  },
  card: { backgroundColor: colors.card },
});
