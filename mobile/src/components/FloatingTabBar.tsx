import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { GlassView } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { lensMetrics, TAB_BAR_METRICS, tabBarBottom } from "../lib/tab-bar";
import { colors, radius } from "../lib/theme";
import {
  GlassSurface,
  glassPath,
  useGlassPreferences,
  useKeyboardVisible,
  type GlassPath,
} from "./GlassSurface";
import type { IconName } from "./tab-icons";

/**
 * The floating "Liquid Glass" tab bar, shared by the customer and rider surfaces.
 *
 * USAGE (from a layout)
 *
 *   const pathname = usePathname();
 *   const selected = resolveTabIndex(pathname, TABS.map((t) => t.route));
 *
 *   <FloatingTabBar
 *     tabs={[
 *       { key: "home",    label: "Home",    ...TAB_ICONS.home },
 *       { key: "orders",  label: "Orders",  ...TAB_ICONS.orders },
 *       { key: "account", label: "Account", ...TAB_ICONS.account, badge: 2 },
 *     ]}
 *     selectedIndex={selected}
 *     onChange={(i) => router.navigate(TABS[i].route)}
 *     hidden={pathname === "/customer/cart"}
 *   />
 *
 * The bar is absolutely positioned over the screen, so the layout also wraps its
 * Stack in <TabBarInsetProvider> and each scrolling screen pads its content with
 * useTabBarInset().
 *
 * `selectedIndex` is derived from the pathname, never from the last tap, so a
 * deep link, a push notification or a router.replace moves the lens too. -1
 * (a route that belongs to no tab) fades the lens out.
 *
 * WHERE TO TWEAK
 *   Blur and tint ....... GlassSurface.tsx, the "TWEAK: MATERIAL" block
 *   The lens ............ <Lens> and LENS_RIM below, sizes in lib/tab-bar.ts
 *   Animation ........... LENS_SPRING, ACTIVE_SCALE, PRESS_SCALE and the
 *                         "TWEAK: MOTION" effects inside FloatingTabBar
 */

export interface FloatingTab {
  /** Stable identity for React. */
  key: string;
  label: string;
  /** Ionicon shown when idle, usually the outline variant. */
  icon: IconName;
  /** Filled variant shown when selected. Falls back to `icon`. */
  activeIcon?: IconName;
  /** Count drawn on the icon, e.g. waiting offers. 0 or absent draws nothing. */
  badge?: number;
  /** Overrides the spoken name. Defaults to the label, plus the badge if any. */
  accessibilityLabel?: string;
}

/* ------------------------------------------------------------------ *
 * === TWEAK: MOTION ===
 * ------------------------------------------------------------------ */

/** ~0.35s to settle with a small overshoot (damping ratio about 0.58). */
const LENS_SPRING = { damping: 16, stiffness: 190, mass: 1 } as const;
/** The selected tab's icon and label sit slightly larger inside the lens. */
const ACTIVE_SCALE = 1.06;
/** A pressed tab swells a little more while the finger is down. */
const PRESS_SCALE = 1.12;
/** How far the lens stretches sideways mid-slide, like a drop pulled along. */
const LENS_STRETCH = 1.22;
/** Time to reach full stretch before the spring pulls it back to shape. */
const LENS_STRETCH_MS = 110;

/* ------------------------------------------------------------------ *
 * === TWEAK: THE LENS ===
 * React Native cannot refract or magnify what is behind a view, so off iOS 26
 * the lens is an approximation: a thin multi-stop gradient rim for the faint
 * rainbow edge, a translucent white body and an inner highlight. It reads as a
 * glass bead sitting on the bar; it does not bend the content behind it.
 * ------------------------------------------------------------------ */

const LENS_RIM = [
  "rgba(255, 255, 255, 0.95)",
  "rgba(255, 214, 224, 0.60)",
  "rgba(214, 240, 255, 0.60)",
  "rgba(214, 255, 232, 0.60)",
  "rgba(255, 255, 255, 0.95)",
] as const;
const LENS_BODY = "rgba(255, 255, 255, 0.55)";
const LENS_GLOW = ["rgba(255, 255, 255, 0.75)", "rgba(255, 255, 255, 0)"] as const;
/** Rim thickness: the gradient shows only in this band around the body. */
const LENS_RIM_WIDTH = 1.5;

function Lens({
  path,
  reduceTransparency,
}: {
  path: GlassPath;
  reduceTransparency: boolean;
}) {
  if (path === "native") {
    // The real material on iOS 26. "clear" rather than "regular" so it reads as
    // a lens over the bar's own regular glass instead of a second frosted slab.
    return (
      <GlassView
        glassEffectStyle="clear"
        colorScheme="light"
        style={[StyleSheet.absoluteFill, styles.round]}
      />
    );
  }
  if (reduceTransparency) {
    return <View style={[StyleSheet.absoluteFill, styles.round, styles.lensSolid]} />;
  }
  return (
    <>
      <LinearGradient
        colors={LENS_RIM}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, styles.round]}
      />
      <View style={styles.lensBody} />
      <LinearGradient colors={LENS_GLOW} style={styles.lensGlow} />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * The bar
 * ------------------------------------------------------------------ */

export function FloatingTabBar({
  tabs,
  selectedIndex,
  onChange,
  accent = colors.primary,
  hidden = false,
}: {
  tabs: readonly FloatingTab[];
  /** Index into `tabs`, or -1 for "no tab selected". */
  selectedIndex: number;
  onChange: (index: number) => void;
  /** Colour of the selected icon and label. */
  accent?: string;
  /** Slides the bar away, e.g. on a screen that pins its own footer. */
  hidden?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const prefs = useGlassPreferences();
  const keyboard = useKeyboardVisible();
  // The keyboard hides the bar too: on Android the window resizes for it and a
  // bottom-anchored bar would otherwise ride up and sit on top of the keyboard.
  const gone = hidden || keyboard;

  const count = tabs.length;
  const [innerWidth, setInnerWidth] = useState(0);
  const { translateX, lensWidth } = lensMetrics(selectedIndex, count, innerWidth);
  // lensMetrics measures from the tabs' left edge; the lens is positioned from
  // the bar's, so the bar's inner padding is added back on.
  const lensTarget = translateX + TAB_BAR_METRICS.innerPadding;

  const [lensX] = useState(() => new Animated.Value(0));
  const [lensOpacity] = useState(() => new Animated.Value(0));
  const [lensStretch] = useState(() => new Animated.Value(1));
  const [show] = useState(() => new Animated.Value(gone ? 0 : 1));
  const scales = useMemo(
    () => Array.from({ length: count }, () => new Animated.Value(1)),
    [count]
  );
  const placed = useRef(false);

  // === TWEAK: MOTION -- the lens follows the selection ===
  // Transforms and opacity only, on the native driver, so the slide never waits
  // on the JS thread.
  useEffect(() => {
    if (innerWidth <= 0) return;
    const visible = selectedIndex >= 0 ? 1 : 0;

    if (!placed.current) {
      // First layout: put the lens in place rather than sliding it in from x=0.
      placed.current = true;
      lensX.setValue(lensTarget);
      lensOpacity.setValue(visible);
      return;
    }

    if (prefs.reduceMotion) {
      // Reduce Motion: a short cross-fade. Out, move while invisible, back in.
      Animated.timing(lensOpacity, {
        toValue: 0,
        duration: 90,
        useNativeDriver: true,
      }).start(() => {
        lensX.setValue(lensTarget);
        Animated.timing(lensOpacity, {
          toValue: visible,
          duration: 140,
          useNativeDriver: true,
        }).start();
      });
      return;
    }

    Animated.parallel([
      Animated.spring(lensX, {
        toValue: lensTarget,
        ...LENS_SPRING,
        useNativeDriver: true,
      }),
      Animated.timing(lensOpacity, {
        toValue: visible,
        duration: 160,
        useNativeDriver: true,
      }),
      // Stretch out as it leaves, then spring back to shape as it lands, so the
      // slide reads as one object travelling rather than a jump.
      Animated.sequence([
        Animated.timing(lensStretch, {
          toValue: LENS_STRETCH,
          duration: LENS_STRETCH_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(lensStretch, {
          toValue: 1,
          ...LENS_SPRING,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [
    lensTarget,
    selectedIndex,
    innerWidth,
    prefs.reduceMotion,
    lensX,
    lensOpacity,
    lensStretch,
  ]);

  // === TWEAK: MOTION -- the selected tab's content scale ===
  useEffect(() => {
    scales.forEach((scale, i) => {
      const toValue = !prefs.reduceMotion && i === selectedIndex ? ACTIVE_SCALE : 1;
      if (prefs.reduceMotion) {
        scale.setValue(toValue);
      } else {
        Animated.spring(scale, {
          toValue,
          ...LENS_SPRING,
          useNativeDriver: true,
        }).start();
      }
    });
  }, [scales, selectedIndex, prefs.reduceMotion]);

  // === TWEAK: MOTION -- the whole bar sliding away and back ===
  useEffect(() => {
    Animated.timing(show, {
      toValue: gone ? 0 : 1,
      duration: prefs.reduceMotion ? 100 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [gone, show, prefs.reduceMotion]);

  function pressIn(index: number) {
    if (prefs.reduceMotion) return;
    Animated.spring(scales[index], {
      toValue: PRESS_SCALE,
      ...LENS_SPRING,
      useNativeDriver: true,
    }).start();
  }

  function pressOut(index: number) {
    if (prefs.reduceMotion) return;
    Animated.spring(scales[index], {
      toValue: index === selectedIndex ? ACTIVE_SCALE : 1,
      ...LENS_SPRING,
      useNativeDriver: true,
    }).start();
  }

  function select(index: number) {
    if (index === selectedIndex) return;
    // Haptic on a real change only. A device with no haptic engine must not take
    // the tap down with it, so the rejection is swallowed: the navigation
    // matters, the buzz does not.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onChange(index);
  }

  if (count === 0) return null;

  return (
    <Animated.View
      // Absolutely positioned so content scrolls underneath. box-none keeps the
      // capsule tappable while the space around it passes touches through, and
      // a hidden bar takes no touches at all (opacity 0 alone would still
      // swallow taps meant for the screen's own footer).
      pointerEvents={gone ? "none" : "box-none"}
      accessibilityElementsHidden={gone}
      importantForAccessibility={gone ? "no-hide-descendants" : "auto"}
      style={[
        styles.layer,
        {
          bottom: tabBarBottom(insets.bottom),
          opacity: show,
          transform: [
            {
              translateY: show.interpolate({
                inputRange: [0, 1],
                outputRange: [prefs.reduceMotion ? 0 : 96, 0],
              }),
            },
          ],
        },
      ]}
    >
      {/* === TWEAK: BLUR === the material is in GlassSurface.tsx. */}
      <GlassSurface prefs={prefs} style={StyleSheet.absoluteFill} />

      {/* === TWEAK: THE LENS === one shared element that slides, not a
          background per tab: a per-tab background cannot travel, it could only
          cross-fade in place and lose the sense of one object moving along a
          rail. It sits outside the clipped capsule so the stretch is not cut. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.lens,
          {
            width: lensWidth,
            opacity: lensOpacity,
            transform: [
              { translateX: lensX },
              { scaleX: lensStretch },
              {
                // Thins slightly as it stretches, so it keeps its volume.
                scaleY: lensStretch.interpolate({
                  inputRange: [1, LENS_STRETCH],
                  outputRange: [1, 0.9],
                  extrapolate: "clamp",
                }),
              },
            ],
          },
        ]}
      >
        <Lens path={glassPath(prefs)} reduceTransparency={prefs.reduceTransparency} />
      </Animated.View>

      <View
        accessibilityRole="tablist"
        style={styles.tabs}
        onLayout={(e) =>
          setInnerWidth(e.nativeEvent.layout.width - TAB_BAR_METRICS.innerPadding * 2)
        }
      >
        {tabs.map((tab, index) => {
          const active = index === selectedIndex;
          const badge = tab.badge ?? 0;
          const tint = active ? accent : colors.textMuted;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={
                tab.accessibilityLabel ??
                (badge > 0 ? `${tab.label}, ${badge} new` : tab.label)
              }
              // The whole column is the target: the full bar height and an equal
              // share of its width, which is ~65pt even at five tabs on an
              // iPhone SE, past the 44pt both platforms ask for.
              onPress={() => select(index)}
              onPressIn={() => pressIn(index)}
              onPressOut={() => pressOut(index)}
              style={styles.tab}
            >
              <Animated.View
                style={[styles.tabContent, { transform: [{ scale: scales[index] }] }]}
              >
                <View>
                  <Ionicons
                    name={active ? (tab.activeIcon ?? tab.icon) : tab.icon}
                    size={22}
                    color={tint}
                  />
                  {badge > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
                        {badge > 9 ? "9+" : badge}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  numberOfLines={1}
                  // Dynamic Type: the label may grow ~20% and then truncates
                  // rather than wrapping, since a two-line label breaks the row.
                  maxFontSizeMultiplier={1.2}
                  style={[styles.label, { color: tint }]}
                >
                  {tab.label}
                </Text>
              </Animated.View>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    left: TAB_BAR_METRICS.horizontalMargin,
    right: TAB_BAR_METRICS.horizontalMargin,
    height: TAB_BAR_METRICS.height,
  },
  round: { borderRadius: radius.pill },
  lens: {
    position: "absolute",
    left: 0,
    // Centred vertically inside the bar.
    top: (TAB_BAR_METRICS.height - TAB_BAR_METRICS.lensHeight) / 2,
    height: TAB_BAR_METRICS.lensHeight,
    borderRadius: radius.pill,
  },
  lensBody: {
    ...StyleSheet.absoluteFill,
    margin: LENS_RIM_WIDTH,
    borderRadius: radius.pill,
    backgroundColor: LENS_BODY,
  },
  lensGlow: {
    position: "absolute",
    top: LENS_RIM_WIDTH,
    left: LENS_RIM_WIDTH,
    right: LENS_RIM_WIDTH,
    height: "50%",
    borderRadius: radius.pill,
  },
  lensSolid: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tabs: {
    ...StyleSheet.absoluteFill,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: TAB_BAR_METRICS.innerPadding,
  },
  tab: {
    flex: 1,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
  tabContent: {
    alignItems: "center",
    gap: 1,
  },
  label: {
    fontSize: 10.5,
    fontWeight: "600",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -10,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textInverse,
  },
});
