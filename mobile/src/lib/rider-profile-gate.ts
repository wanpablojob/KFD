/**
 * What a rider screen should render, given the state of its profile query.
 *
 * The rider surface had three copies of "is there a profile?" and each got it
 * wrong in its own way, which is why the bug looked like two unrelated bugs:
 *
 *   - Available (rider-offers-screen) gated on `!profile`, i.e. "profile is
 *     falsy", and its `isPending` came from the OFFERS query, never from the
 *     profile query. So the moment offers resolved, the screen checked a profile
 *     that was still loading, `!profile` was true, and it rendered the dead end:
 *     "No rider profile is linked to this account." with a Sign out button.
 *     Riders were told to sign out of a perfectly good account.
 *
 *   - Deliveries (rider-home-screen) gated on `profile === null`, which is the
 *     opposite failure: undefined is NOT null, so a loading profile fell through
 *     to the list, which then synced from a page-1 query that was also still in
 *     flight.
 *
 *   - Profile read `isLoading` off the profile query correctly, but still used
 *     `!profile` for the gate, so the same conflation was one refetch away.
 *
 * The class of defect is not "the profile gate is wrong in three files". It is
 * **conflating three distinct states -- unknown, absent, and present -- into a
 * two-way check**. React Query's `data` is `undefined` while loading and `null`
 * when the query resolved with no row, and those need different screens: a
 * spinner, a dead end, and content. Only one function here has to be right.
 */

export type RiderProfileGate =
  /** Still resolving. Render a spinner; do not claim anything about the account. */
  | { kind: "loading" }
  /** The query failed. Show the error, not "no profile". */
  | { kind: "error"; message: string }
  /** Resolved with no rider row. The only state that is genuinely a dead end. */
  | { kind: "missing" }
  /**
   * Resolved with a rider row. Carries the row so a caller cannot narrow on
   * `kind` and then read a still-possibly-undefined value from the query.
   */
  | { kind: "ready"; profile: unknown };

export interface ProfileQueryState {
  data: unknown;
  isPending: boolean;
  error: unknown;
}

export function riderProfileGate(state: ProfileQueryState): RiderProfileGate {
  // Error first. A failed query leaves `data` undefined, and checking `data`
  // before `error` reports a network or RLS failure as "this account has no
  // rider profile" -- which sends the rider to sign out of a working account.
  if (state.error) {
    return {
      kind: "error",
      message:
        state.error instanceof Error
          ? state.error.message
          : "Could not load your rider profile.",
    };
  }
  // isPending is the query's OWN, not a sibling query's. A disabled query
  // (`enabled: !!userId`) is pending forever with no user id yet, so this must
  // not be treated as an error -- the id arriving re-runs it.
  if (state.isPending) return { kind: "loading" };
  // Only now is `undefined` meaningful, and it is not: an explicitly-null row is
  // the one and only "no profile" signal.
  if (state.data === null || state.data === undefined) {
    return { kind: "missing" };
  }
  return { kind: "ready", profile: state.data };
}
