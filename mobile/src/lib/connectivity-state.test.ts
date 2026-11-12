import { isOffline } from "./connectivity-state";

describe("isOffline", () => {
  it("is offline only when the device has no connection", () => {
    expect(isOffline({ isConnected: false, isInternetReachable: null })).toBe(true);
  });

  it("does NOT treat a failed reachability probe as offline", () => {
    // The regression. NetInfo's probe fails on some carrier networks and
    // captive portals while the network itself works, and the rider screen
    // used this to disable "Complete delivery" -- an inert button with no
    // explanation, on a phone that could reach Supabase fine. The query
    // client's online manager (connectivity-manager.ts) already ignores this
    // signal for the same reason; the two now agree.
    expect(isOffline({ isConnected: true, isInternetReachable: false })).toBe(false);
  });

  it("is not offline while the signal is still unknown", () => {
    // null is "not measured yet", not "no network". Blocking on it means the
    // first seconds after launch refuse every tap.
    expect(isOffline({ isConnected: null, isInternetReachable: null })).toBe(false);
    expect(isOffline({ isConnected: null, isInternetReachable: false })).toBe(false);
  });

  it("accepts a signal with no reachability field at all", () => {
    expect(isOffline({ isConnected: false })).toBe(true);
    expect(isOffline({ isConnected: true })).toBe(false);
  });
});
