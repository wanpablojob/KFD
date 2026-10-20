/**
 * Pure geometry and routing for the floating tab bar.
 *
 * Everything here is a function of its arguments with no React and no React
 * Native, so the two decisions that are easy to get subtly wrong -- which tab a
 * pathname means, and where the sliding lens sits -- are testable without a
 * renderer. The component in components/FloatingTabBar.tsx holds the pixels and
 * nothing else.
 *
 * Both of these used to be inline in each layout and had already drifted apart.
 */

/* ------------------------------------------------------------------ *
 * Which tab is selected
 * ------------------------------------------------------------------ */

/**
 * The index of the tab a pathname belongs to, or -1 when it belongs to none.
 *
 * The awkward case is that one tab's route is a string prefix of another's. The
 * rider bar is exactly that: "/rider" is a prefix of "/rider/offers",
 * "/rider/earnings" and "/rider/profile", and "/rider" is not even the first tab
 * -- Available is, so the root sits at index 1. An index-based special case for
 * "the root tab" is therefore wrong for one of the two surfaces, whichever way
 * it is written.
 *
 * So nothing is special-cased. Every tab is scored and the most specific match
 * wins: an exact match beats a prefix match, and among equals the longest route
 * wins. That makes the answer independent of the order the tabs are declared in,
 * which is what lets the rider's Available-first ordering work without the helper
 * knowing anything about it.
 *
 *   "/rider/earnings"        -> earnings (exact) over /rider (prefix)
 *   "/rider/offers/expired"  -> offers (longest prefix) over /rider
 *   "/rider"                 -> the /rider tab, exactly
 *
 * Prefix matching is on segment boundaries, so "/riderprofile" is not mistaken
 * for "/rider/profile" and "/customers" is not "/customer".
 *
 * -1 rather than 0 for "no match": a screen reached by deep link that is not a
 * tab (a restaurant, the cart, the storefront root) must show no lens rather than
 * silently selecting the first tab and implying the user is somewhere they are
 * not.
 */
export function resolveTabIndex(
  pathname: string | null | undefined,
  routes: readonly string[]
): number {
  if (!pathname || routes.length === 0) return -1;

  // Tolerate a trailing slash so "/customer/" is the Home tab, not "nothing".
  const path = stripTrailingSlash(pathname);

  let best = -1;
  let bestLength = -1;
  let bestIsExact = false;

  for (let i = 0; i < routes.length; i += 1) {
    const route = stripTrailingSlash(routes[i]);
    if (!route) continue;

    const isExact = path === route;
    // `path === route` is already covered above, so what is left is a genuine
    // sub-route such as /rider/offers/expired.
    const isPrefix = path.startsWith(route + "/");
    if (!isExact && !isPrefix) continue;

    const isBetter =
      best === -1 ||
      // Exact beats prefix regardless of length.
      (isExact && !bestIsExact) ||
      // Same kind of match: the longer, more specific route wins.
      (isExact === bestIsExact && route.length > bestLength);

    if (isBetter) {
      best = i;
      bestLength = route.length;
      bestIsExact = isExact;
    }
  }

  return best;
}

function stripTrailingSlash(value: string): string {
  return value.length > 1 && value.endsWith("/") ? value.slice(0, -1) : value;
}

/* ------------------------------------------------------------------ *
 * Lens geometry
 * ------------------------------------------------------------------ */

/**
 * Capsule and lens dimensions, in points.
 *
 * Collected here rather than in the component so the inset a scrolling screen
 * needs and the bar that occupies that inset cannot disagree -- that mismatch is
 * how "the last item is hidden behind the bar" happens.
 */
export const TAB_BAR_METRICS = {
  /** Bar height, excluding the safe-area inset beneath it. */
  height: 58,
  /** Gap between the screen edge and the capsule, each side. */
  horizontalMargin: 28,
  /** Gap between the bottom safe-area inset and the capsule. */
  bottomGap: 10,
  /** Used when a device reports no inset at all (Android with no nav bar). */
  minBottomGap: 12,
  /**
   * The lens sits inside the bar with a small margin all round, so the bar
   * stays one compact capsule. Its width follows the tab (see lensMetrics).
   */
  lensHeight: 48,
  /** Space left between the lens and the edges of its tab column. */
  lensSideGap: 3,
  /** The lens never gets narrower than this, so an icon and label still fit. */
  lensMinWidth: 52,
  /** Nor wider than this, so three tabs do not turn it into a long slab. */
  lensMaxWidth: 84,
  /** Horizontal inset inside the bar before the tabs begin. */
  innerPadding: 5,
} as const;

/**
 * Height a scrolling screen must leave clear so its last row is not under the
 * bar. This is the value `useTabBarInset()` returns.
 *
 * `bottomInset` is the safe area, not a guess: on a device with a home
 * indicator it is ~34pt, and on one without it is 0. A fixed constant would
 * either float the bar over the home indicator or push the content too far down
 * on a device that has no inset.
 */
export function tabBarInset(bottomInset: number, hasBar = true, above = 0): number {
  if (!hasBar) return 0;
  return tabBarBottom(bottomInset) + TAB_BAR_METRICS.height + Math.max(above, 0);
}

/**
 * Distance from the bottom of the screen to the bottom of the capsule.
 *
 * The bar and anything floating above it (the cart pill) both position from this
 * one number, so they cannot disagree about where the bar is.
 */
export function tabBarBottom(bottomInset: number): number {
  return (
    Math.max(bottomInset, TAB_BAR_METRICS.minBottomGap) + TAB_BAR_METRICS.bottomGap
  );
}

/**
 * Where the lens sits, given the selected tab.
 *
 * `innerWidth` is the width available to the tabs -- the bar's width minus its
 * horizontal margins and inner padding -- not the bar's own width. The component
 * measures that once with onLayout and passes it here, so the lens and the tabs
 * are guaranteed to be laid out against the same number.
 *
 * Returned as a translateX offset from the tabs row's left edge rather than as a
 * `left` or `width` style, because translateX is the one property Animated can
 * drive on the UI thread. Animating `left` would run the slide on the JS thread
 * and stutter under a finger.
 *
 * Tab widths are equal: the row divides its width by the count, so the lens lands
 * centred in whichever tab is selected, for any count from 2 to 5.
 *
 * `selectedIndex` is clamped because a lens parked half off the end of the bar
 * looks broken, and the bar is also rendered on routes where no tab matched
 * (resolveTabIndex returning -1), which is exactly when that happens.
 */
export function lensMetrics(
  selectedIndex: number,
  tabCount: number,
  innerWidth: number
): { translateX: number; tabWidth: number; lensWidth: number } {
  if (tabCount <= 0) return { translateX: 0, tabWidth: 0, lensWidth: 0 };

  const usable = Math.max(innerWidth, 0);
  const tabWidth = usable / tabCount;
  const index = Math.max(0, Math.min(selectedIndex, tabCount - 1));

  // Fill the tab less a small gap, within the min/max, but never wider than the
  // tab itself: on a very narrow bar the minimum would otherwise spill into the
  // neighbouring tab.
  const lensWidth = Math.min(
    tabWidth,
    Math.max(
      TAB_BAR_METRICS.lensMinWidth,
      Math.min(TAB_BAR_METRICS.lensMaxWidth, tabWidth - TAB_BAR_METRICS.lensSideGap * 2)
    )
  );

  // Centre the lens on the middle of its tab.
  const centre = tabWidth * index + tabWidth / 2;
  return { translateX: centre - lensWidth / 2, tabWidth, lensWidth };
}

/**
 * Tappable width available to each tab, for the accessibility floor.
 *
 * Separate from lensMetrics because the touch target is the whole column of the
 * bar while the lens is a smaller object centred inside it, and the two must not
 * be assumed to be the same size.
 */
export function tabTouchTargetWidth(innerWidth: number, tabCount: number): number {
  if (tabCount <= 0) return 0;
  return Math.max(0, innerWidth) / tabCount;
}

/** The 44pt minimum both platforms ask for on an interactive control. */
export const MIN_TOUCH_TARGET = 44;
