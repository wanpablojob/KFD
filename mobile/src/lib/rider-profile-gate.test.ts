import { riderProfileGate } from "./rider-profile-gate";

/**
 * Regression tests for the rider dead end.
 *
 * Reported as two separate bugs: Available said "No rider profile is linked to
 * this account. Sign out" for riders who demonstrably had profiles, and
 * Deliveries emptied itself on tab change. Same root cause -- a two-way check
 * standing in for a three-way state.
 */

const loaded = { isPending: false, error: null };

describe("riderProfileGate", () => {
  it("reports loading rather than missing while the profile is in flight", () => {
    // The exact state that broke Available: the profile query has not resolved,
    // so data is undefined. Rendering "no profile, sign out" here is wrong, and
    // undefined !== null is the whole distinction.
    expect(riderProfileGate({ data: undefined, isPending: true, error: null })).toEqual(
      { kind: "loading" }
    );
  });

  it("reports missing only once the query resolved with no row", () => {
    expect(riderProfileGate({ data: null, ...loaded })).toEqual({
      kind: "missing",
    });
  });

  it("reports ready when a profile came back", () => {
    expect(
      riderProfileGate({ data: { id: "rdr_01", name: "Juan" }, ...loaded })
    ).toEqual({ kind: "ready", profile: { id: "rdr_01", name: "Juan" } });
  });

  it("treats an error as an error, never as a missing profile", () => {
    // A failed query also leaves data undefined. Reading data before error
    // reported 42501 or a dropped connection as "you have no rider profile",
    // which is how a rider got told to sign out of a working account.
    const gate = riderProfileGate({
      data: undefined,
      isPending: false,
      error: new Error("permission denied for table riders"),
    });
    expect(gate.kind).toBe("error");
    expect(gate).toMatchObject({
      message: "permission denied for table riders",
    });
  });

  it("prefers the error even when a stale profile is still cached", () => {
    // Cached data plus a failed refetch: showing the cached profile is fine,
    // but it must not be mistaken for a clean success either. The error branch
    // wins so the rider is told the refresh failed.
    expect(
      riderProfileGate({
        data: { id: "rdr_01" },
        isPending: false,
        error: new Error("offline"),
      }).kind
    ).toBe("error");
  });

  it("treats an unresolvable error as an error, not a missing profile", () => {
    const gate = riderProfileGate({
      data: undefined,
      isPending: false,
      error: "a bare string",
    });
    expect(gate.kind).toBe("error");
    expect(gate).toMatchObject({
      message: "Could not load your rider profile.",
    });
  });

  it("stays loading while disabled with no user id yet", () => {
    // `enabled: !!userId` means no id is a permanently pending query, never an
    // error and never a missing profile. Reporting missing here would show the
    // dead end during the window before the session resolves.
    expect(riderProfileGate({ data: undefined, isPending: true, error: null })).toEqual(
      { kind: "loading" }
    );
  });
});
