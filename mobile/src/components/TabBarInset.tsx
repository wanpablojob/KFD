import { createContext, use, useMemo, type ReactNode } from "react";
import { tabBarInset } from "../lib/tab-bar";
import { spacing } from "../lib/theme";

/**
 * How much vertical space the floating tab bar is occupying right now.
 *
 * The bar is absolutely positioned so content scrolls underneath it, which makes
 * every scrolling screen responsible for leaving the last row clear. Handing that
 * number to each screen by hand is how a screen ends up guessing: one reserves
 * the bar height, another reserves it plus the safe area, a third was written
 * before the bar floated and reserves nothing. The result is either a hidden last
 * item or a strip of dead space under the list.
 *
 * So the layouts publish the inset once, from the same function that sizes the
 * bar, and screens read it. It goes to zero when the bar is hidden -- the cart
 * screen pins its own checkout footer -- so content there reclaims the space
 * automatically instead of carrying a special case.
 */
const TabBarInsetContext = createContext<number>(0);

export function TabBarInsetProvider({
  bottomInset,
  hasBar = true,
  above = 0,
  children,
}: {
  /** Safe-area bottom inset from useSafeAreaInsets(). */
  bottomInset: number;
  /** False when the bar is hidden on this route, e.g. the cart. */
  hasBar?: boolean;
  /** Space taken by anything floating above the bar, e.g. cartPillInset(). */
  above?: number;
  children: ReactNode;
}) {
  const inset = useMemo(
    () => tabBarInset(bottomInset, hasBar, above),
    [bottomInset, hasBar, above]
  );
  return (
    <TabBarInsetContext.Provider value={inset}>{children}</TabBarInsetContext.Provider>
  );
}

/**
 * Bottom padding a scroll view needs so its last row is not under the bar.
 *
 * Defaults to 0 outside a provider rather than throwing: a screen rendered
 * outside the tab navigator should not crash over a style value, and 0 is the
 * honest answer there.
 */
export function useTabBarInset(): number {
  return use(TabBarInsetContext);
}

/**
 * The paddingBottom a scrolling screen's content container should use.
 *
 * Under the bar it is the bar's inset plus a little breathing room, so the last
 * row clears the glass instead of touching it. Where there is no bar (hidden, or
 * outside a provider) it falls back to the screen's own `base`, which is what the
 * lists used before the bar floated.
 */
export function useScrollBottomPadding(base: number = spacing.xxl): number {
  const inset = useTabBarInset();
  return inset > 0 ? inset + spacing.lg : base;
}
