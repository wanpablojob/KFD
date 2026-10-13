"use client";

import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing, type } from "../lib/theme";

/**
 * The app's bottom navigation bar.
 *
 * Liquid glass: the content behind it is genuinely blurred and tinted rather
 * than painted a flat colour, so scrolling content appears to sit *under* the
 * bar instead of being cut off by it.
 *
 * Why a shared component now: the rider and customer surfaces each had their own
 * BottomNav, and the two had already drifted -- different paddings, different
 * active-state styling, different ways of expressing a badge. A redesign applied
 * twice is how they drift further. One component, one place to change it, and
 * the customer's cart button keeps its own slot rather than being special-cased
 * here.
 *
 * The bar is translucent on purpose, so its contents must stay legible against
 * arbitrary content scrolling underneath. Two things keep that true:
 *
 *   - A soft warm scrim under the blur. Pure transparency over a cream app put
 *     icons on top of whatever order text happened to be passing, which is how
 *     "liquid glass" turns into "unreadable".
 *   - A top hairline, because without an edge the bar's boundary dissolves into
 *     the page the moment the content behind it is light.
 *
 * Blur intensity is an implementation detail rather than a design knob here: it
 * is 20 on Android, where BlurView falls back to a plain tint, and 60 on iOS
 * where it is a real backdrop filter. Anything above ~60 on iOS costs frames
 * during the scroll this bar sits under, and nothing below ~20 stops the
 * background reading as flat.
 */
export interface GlassTab {
  route: string;
  label: string;
  /** Decorative glyph. The label below it is the accessible name. */
  glyph: string;
  /** Spoken name of what the glyph stands for. */
  iconLabel: string;
  /** Count shown in the corner pill, when greater than zero. */
  badge?: number;
}

export function GlassBottomNav({
  pathname,
  tabs,
  onNavigate,
  leading,
}: {
  pathname: string;
  tabs: GlassTab[];
  onNavigate: (route: string) => void;
  /** Optional control pinned to the leading edge, e.g. the cart. */
  leading?: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      {/* The hairline sits above the blur so it stays crisp rather than being
          blurred along with everything else. */}
      <View style={styles.hairline} />
      <BlurView
        intensity={Platform.OS === "android" ? 20 : 60}
        tint="light"
        style={styles.blur}
      >
        {/* Warm scrim. Without it the bar is see-through to whatever the page
            is showing, which is the failure mode that makes glass unusable. */}
        <View style={styles.scrim} />
        <View
          style={[styles.bar, leading ? styles.barWithLeading : styles.barCentered]}
        >
          {leading}
          {tabs.map((tab) => {
            const active =
              tab.route === "/rider"
                ? pathname === "/rider" || pathname === "/rider/"
                : pathname.startsWith(tab.route);
            const badge = tab.badge ?? 0;
            return (
              <Pressable
                key={tab.route}
                style={styles.tab}
                onPress={() => onNavigate(tab.route)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={
                  badge > 0
                    ? `${tab.label}, ${badge} offer${badge === 1 ? "" : "s"} waiting`
                    : tab.label
                }
                accessibilityHint={`${tab.iconLabel} tab`}
              >
                <View>
                  {/* Glyph is decorative: the tab's name is its label, so a
                      screen reader is not handed the unicode point name too. */}
                  <Text
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                    style={[styles.glyph, active && styles.glyphActive]}
                  >
                    {tab.glyph}
                  </Text>
                  {badge > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  numberOfLines={1}
                  style={[styles.label, active && styles.labelActive]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // No background and no top border here: the bar's own hairline draws the
    // edge, and a background on the wrapper would show through the blur's own
    // transparent margins as a seam.
    overflow: "hidden",
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderStrong,
    opacity: 0.55,
  },
  blur: {
    // overflow:hidden is required for the blur to clip to the bar; without it
    // the blur bleeds up over the hairline on Android.
    overflow: "hidden",
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    // Warm and mostly transparent. Strong enough to guarantee contrast against
    // the app's own palette, weak enough that the blur still reads.
    backgroundColor: "rgba(255, 250, 235, 0.72)",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  barCentered: { justifyContent: "center" },
  barWithLeading: { justifyContent: "flex-end" },
  tab: {
    alignItems: "center",
    gap: 2,
    paddingHorizontal: spacing.sm,
    // minWidth rather than width: the label truncates rather than overflowing,
    // so a long translation cannot push the row past the screen.
    minWidth: 56,
    flexShrink: 1,
  },
  glyph: {
    fontSize: 20,
    color: colors.textFaint,
  },
  glyphActive: {
    color: colors.primary,
    // The active tab is also the only one that gains weight, so the distinction
    // survives a screen reader, a colourblind rider and a greyscale screenshot.
    fontWeight: "700",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textInverse,
  },
  label: {
    ...type.caption,
    fontSize: 11,
    fontWeight: "600",
    color: colors.textFaint,
  },
  labelActive: {
    color: colors.primary,
  },
});
