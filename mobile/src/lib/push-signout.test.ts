import { shouldUnregisterOnSignOut } from "./push-signout";

/**
 * Sign-out cleanup for push registration.
 *
 * The three account screens gated this on `push.granted && push.registered`,
 * which is the right question for a *switch* ("is push on?") and the wrong one
 * for *cleanup* ("does the server still hold a token for this device?").
 *
 * The two flags come from different places and drift apart routinely: `granted`
 * is the live OS permission from Notifications.getPermissionsAsync(), and
 * `registered` is a local SecureStore marker set only after the server accepted
 * a token. Revoking the permission in system settings flips the first without
 * touching the other two -- and the token row survives, so the next person to
 * sign in on the handset receives the previous user's order references and
 * dispatch offers.
 */

test("a registered device is unregistered on sign-out even without permission", () => {
  // The drift case: the user revoked notifications in system settings, so
  // `granted` is false, but the server row is still there. The old AND said
  // "off", skipped the DELETE, and leaked pushes to the next sign-in.
  expect(shouldUnregisterOnSignOut({ granted: false, registered: true })).toBe(true);
});

test("a registered device with permission is unregistered", () => {
  // The happy path, unchanged.
  expect(shouldUnregisterOnSignOut({ granted: true, registered: true })).toBe(true);
});

test("a device that never registered is not unregistered", () => {
  // Nothing of ours exists server-side, so there is nothing to delete. This is
  // the one case where the old condition was accidentally right.
  expect(shouldUnregisterOnSignOut({ granted: true, registered: false })).toBe(false);
  expect(shouldUnregisterOnSignOut({ granted: false, registered: false })).toBe(false);
});

test("the decision depends on registered alone, not on granted", () => {
  // Same registration state, both grant values -> same answer. This is the
  // regression guard on the exact bug: flipping only `granted` must not change
  // whether sign-out cleans up.
  for (const registered of [true, false]) {
    const withPermission = shouldUnregisterOnSignOut({ granted: true, registered });
    const withoutPermission = shouldUnregisterOnSignOut({ granted: false, registered });
    expect(withPermission).toBe(withoutPermission);
  }
});
