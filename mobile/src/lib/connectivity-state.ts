/**
 * "Offline" is one decision, made here once.
 *
 * NetInfo reports two signals and they do not mean the same thing:
 *
 *   isConnected          the device has a network interface with a route
 *   isInternetReachable  NetInfo's own probe (a fetch to a well-known URL)
 *
 * The probe is the unreliable one. On a carrier network or behind a captive
 * portal it settles on `false` while Supabase is perfectly reachable, and this
 * repo already made that call once, in lib/connectivity-manager.ts: the query
 * client's online manager ignores it deliberately, because consulting it
 * paused polling on phones that were working.
 *
 * The rider screen then did the opposite. It treated the probe as offline and
 * disabled every write button, "Complete delivery" included. A rider on mobile
 * data whose probe had failed got a button that looked live and did nothing,
 * so a finished delivery could not be closed. That is the same fact in two
 * places disagreeing; this module is the one place so it cannot happen again.
 *
 * `isConnected === false` is the only unambiguous signal we have. Anything else
 * -- null while starting, or a failed probe -- means "not known to be offline",
 * and a write is allowed to be attempted. A request that fails gives the rider
 * a real error to act on, which is better than an inert control.
 */
export interface ConnectivitySignal {
  isConnected: boolean | null;
  isInternetReachable?: boolean | null;
}

export function isOffline(state: ConnectivitySignal): boolean {
  return state.isConnected === false;
}
