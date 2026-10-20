import {
  MIN_TOUCH_TARGET,
  TAB_BAR_METRICS,
  lensMetrics,
  resolveTabIndex,
  tabBarBottom,
  tabBarInset,
  tabTouchTargetWidth,
} from "./tab-bar";

/**
 * The two decisions the floating tab bar gets wrong easily, tested without a
 * renderer: which tab a pathname means, and where the sliding lens sits.
 *
 * Both were inline in each layout before this module and had already drifted
 * between the rider and customer surfaces.
 */

const CUSTOMER_ROUTES = ["/customer", "/customer/orders", "/customer/account"]; // a subset of the live tabs
const RIDER_ROUTES = ["/rider/offers", "/rider", "/rider/earnings", "/rider/profile"];

describe("resolveTabIndex", () => {
  it("matches each tab on its own route", () => {
    expect(resolveTabIndex("/customer", CUSTOMER_ROUTES)).toBe(0);
    expect(resolveTabIndex("/customer/orders", CUSTOMER_ROUTES)).toBe(1);
    expect(resolveTabIndex("/customer/account", CUSTOMER_ROUTES)).toBe(2);
    expect(resolveTabIndex("/rider/offers", RIDER_ROUTES)).toBe(0);
    expect(resolveTabIndex("/rider/earnings", RIDER_ROUTES)).toBe(2);
    expect(resolveTabIndex("/rider/profile", RIDER_ROUTES)).toBe(3);
  });

  it("does not let the root tab swallow its own children", () => {
    // The load-bearing case. "/rider" is a string prefix of "/rider/offers",
    // "/rider/earnings" and "/rider/profile", so any startsWith comparison makes
    // the Deliveries tab either unreachable or permanently selected. The root is
    // the rider's SECOND tab, which is what makes this arrangement possible.
    expect(resolveTabIndex("/rider/offers", RIDER_ROUTES)).not.toBe(1);
    expect(resolveTabIndex("/rider/earnings", RIDER_ROUTES)).not.toBe(1);
    expect(resolveTabIndex("/rider/profile", RIDER_ROUTES)).not.toBe(1);
    expect(resolveTabIndex("/rider", RIDER_ROUTES)).toBe(1);
  });

  it("matches on segment boundaries, not raw prefixes", () => {
    // Neither of these is a tab, and a loose prefix match would light one up.
    expect(resolveTabIndex("/riderprofile", RIDER_ROUTES)).toBe(-1);
    expect(resolveTabIndex("/customers", CUSTOMER_ROUTES)).toBe(-1);
  });

  it("treats a trailing slash as the same route", () => {
    expect(resolveTabIndex("/customer/", CUSTOMER_ROUTES)).toBe(0);
    expect(resolveTabIndex("/customer/orders/", CUSTOMER_ROUTES)).toBe(1);
    expect(resolveTabIndex("/rider/", RIDER_ROUTES)).toBe(1);
  });

  it("selects the tab for a sub-route of a tab", () => {
    // Deep links and nested screens should keep the parent tab lit.
    expect(resolveTabIndex("/rider/offers/expired", RIDER_ROUTES)).toBe(0);
  });

  it("keeps the parent tab lit on a screen that is not itself a tab", () => {
    // /customer/restaurant is not a tab, but it is reached from Home and the bar
    // is still on screen there, so Home staying lit is the honest answer -- the
    // alternative is a bar with nothing selected. The "no match" case below is
    // for routes that belong to no tab at all.
    expect(resolveTabIndex("/customer/restaurant", CUSTOMER_ROUTES)).toBe(0);
  });

  it("returns -1 for a route that belongs to no tab", () => {
    // The storefront root, sign-in and the tracking page all live outside the
    // navigator. -1 means "no lens" rather than quietly selecting the first tab
    // and implying the user is somewhere they are not.
    expect(resolveTabIndex("/", CUSTOMER_ROUTES)).toBe(-1);
    expect(resolveTabIndex("/login", CUSTOMER_ROUTES)).toBe(-1);
    expect(resolveTabIndex("/track", CUSTOMER_ROUTES)).toBe(-1);
    expect(resolveTabIndex("/customerish", CUSTOMER_ROUTES)).toBe(-1);
  });

  it("returns -1 for an absent pathname or an empty tab list", () => {
    expect(resolveTabIndex(null, CUSTOMER_ROUTES)).toBe(-1);
    expect(resolveTabIndex(undefined, CUSTOMER_ROUTES)).toBe(-1);
    expect(resolveTabIndex("", CUSTOMER_ROUTES)).toBe(-1);
    expect(resolveTabIndex("/customer", [])).toBe(-1);
  });
});

describe("lensMetrics", () => {
  const INNER = 339; // a 375pt screen less the capsule margins and padding

  it("centres the lens on the selected tab", () => {
    const { translateX, tabWidth, lensWidth } = lensMetrics(0, 4, INNER);
    expect(tabWidth).toBeCloseTo(INNER / 4);
    // Middle of the first tab, less half the lens.
    expect(translateX).toBeCloseTo(tabWidth / 2 - lensWidth / 2);
  });

  it("slides one tab-width per step", () => {
    const widths = [0, 1, 2, 3].map((i) => lensMetrics(i, 4, INNER).translateX);
    const step = widths[1] - widths[0];
    expect(step).toBeGreaterThan(0);
    for (let i = 1; i < widths.length; i += 1) {
      expect(widths[i] - widths[i - 1]).toBeCloseTo(step);
    }
  });

  it("keeps the lens inside the row for any tab count from 2 to 5", () => {
    // The bar is correct for a variable number of tabs, so the geometry must be
    // too -- three on the customer side, four on the rider's.
    for (const count of [2, 3, 4, 5]) {
      for (let i = 0; i < count; i += 1) {
        const { translateX, lensWidth } = lensMetrics(i, count, INNER);
        expect(translateX).toBeGreaterThanOrEqual(0);
        expect(translateX + lensWidth).toBeLessThanOrEqual(INNER);
      }
    }
  });

  it("clamps an out-of-range selection instead of parking off the end", () => {
    // -1 is what resolveTabIndex returns on a non-tab route, and the bar still
    // renders there.
    const first = lensMetrics(0, 4, INNER);
    expect(lensMetrics(-1, 4, INNER)).toEqual(first);
    const last = lensMetrics(3, 4, INNER);
    expect(lensMetrics(99, 4, INNER)).toEqual(last);
  });

  it("survives a zero or negative width rather than emitting NaN", () => {
    // onLayout has not fired yet on first render, so width 0 is a real state.
    const metrics = lensMetrics(0, 4, 0);
    expect(Number.isFinite(metrics.translateX)).toBe(true);
    expect(Number.isFinite(metrics.tabWidth)).toBe(true);
    expect(Number.isFinite(metrics.lensWidth)).toBe(true);
    expect(lensMetrics(0, 0, INNER)).toEqual({
      translateX: 0,
      tabWidth: 0,
      lensWidth: 0,
    });
  });

  it("sizes the lens to its tab within the min and max", () => {
    // Three customer tabs are wide, so the lens stops at the maximum.
    expect(lensMetrics(0, 3, INNER).lensWidth).toBe(TAB_BAR_METRICS.lensMaxWidth);
    // Four rider tabs: the tab less its side gaps.
    const four = lensMetrics(0, 4, INNER);
    expect(four.lensWidth).toBeCloseTo(four.tabWidth - TAB_BAR_METRICS.lensSideGap * 2);
    // Five tabs on an iPhone SE still keep the minimum.
    expect(lensMetrics(0, 5, 290).lensWidth).toBe(TAB_BAR_METRICS.lensMinWidth);
  });

  it("never lets the lens spill into the next tab on a tiny bar", () => {
    const { lensWidth, tabWidth } = lensMetrics(0, 5, 200);
    expect(lensWidth).toBeLessThanOrEqual(tabWidth);
  });

  it("fits inside the bar rather than overhanging it", () => {
    expect(TAB_BAR_METRICS.lensHeight).toBeLessThan(TAB_BAR_METRICS.height);
  });
});

describe("tabBarInset", () => {
  it("reserves the bar, the safe area and the gap between them", () => {
    const inset = tabBarInset(34);
    expect(inset).toBe(TAB_BAR_METRICS.height + 34 + TAB_BAR_METRICS.bottomGap);
  });

  it("uses the minimum gap on a device with no home indicator", () => {
    // Android with gesture navigation reports 0. Reserving only the bar height
    // would tuck the capsule against the system bar.
    const inset = tabBarInset(0);
    expect(inset).toBe(
      TAB_BAR_METRICS.height + TAB_BAR_METRICS.minBottomGap + TAB_BAR_METRICS.bottomGap
    );
    expect(tabBarInset(0)).toBeGreaterThan(tabBarInset(0) - 1);
  });

  it("never reserves less than the minimum gap, however small the inset", () => {
    // A 4pt inset is a real reading on some devices and must not shrink the gap
    // to nothing, which would put the capsule against the home indicator.
    expect(tabBarInset(4)).toBeGreaterThanOrEqual(
      TAB_BAR_METRICS.height + TAB_BAR_METRICS.minBottomGap + TAB_BAR_METRICS.bottomGap
    );
  });

  it("reserves nothing when the bar is hidden", () => {
    // The cart screen pins its own checkout footer, so the bar is hidden there
    // and the content must reclaim the whole inset.
    expect(tabBarInset(34, false)).toBe(0);
  });
});

describe("bar position", () => {
  it("puts the bar's bottom edge where the inset says it is", () => {
    expect(tabBarBottom(34) + TAB_BAR_METRICS.height).toBe(tabBarInset(34));
    expect(tabBarBottom(0)).toBe(
      TAB_BAR_METRICS.minBottomGap + TAB_BAR_METRICS.bottomGap
    );
  });
});

describe("tabTouchTargetWidth", () => {
  it("gives every tab a comfortable target on a small phone", () => {
    // 375pt screen minus margins: 339 / 4 tabs.
    expect(tabTouchTargetWidth(339, 4)).toBeCloseTo(84.75);
    // The full tab column is the touch target, which clears 44pt with room to
    // spare even on an iPhone SE with the rider's four tabs.
    expect(tabTouchTargetWidth(339, 4)).toBeGreaterThan(MIN_TOUCH_TARGET);
    expect(tabTouchTargetWidth(339, 5)).toBeGreaterThan(MIN_TOUCH_TARGET);
  });

  it("divides evenly and returns zero for an empty bar", () => {
    expect(tabTouchTargetWidth(300, 3)).toBeCloseTo(100);
    expect(tabTouchTargetWidth(300, 0)).toBe(0);
  });
});
