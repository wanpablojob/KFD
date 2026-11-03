import { nextAutoPushAction } from "./push-auto";

/**
 * Auto-registration for push, the thing that was broken.
 *
 * The old rule was "run once per install". It conflated two facts -- whether the
 * OS prompt had been shown and whether this device was registered -- so every
 * event that cleared the registration (sign-out, a failed first attempt,
 * an offline token fetch) also ended the only code path that would ever
 * register the phone again. Dispatch offers and new-order alerts then went to
 * nobody while the app looked perfectly healthy.
 */

const signedIn = {
  signedIn: true,
  optedOut: false,
  registered: false,
  granted: true,
  permission: "granted" as const,
  asked: false,
};

test("re-registers after sign-out cleared the local marker", () => {
  // The reported bug: sign-out runs disablePush(), the OS permission stays
  // granted, and the install is already marked "asked". Registering again is
  // the only way this phone ever hears about a delivery.
  expect(nextAutoPushAction({ ...signedIn, asked: true })).toBe("register");
});

test("re-registers after a first attempt failed", () => {
  // Permission was granted but the token fetch or the register call failed, so
  // `registered` is false and the old marker had already been written.
  expect(nextAutoPushAction(signedIn)).toBe("register");
});

test("asks the OS once, then never again", () => {
  const undetermined = {
    ...signedIn,
    granted: false,
    permission: "undetermined" as const,
  };
  expect(nextAutoPushAction(undetermined)).toBe("ask");
  // Same state after the prompt was shown and declined or failed.
  expect(nextAutoPushAction({ ...undetermined, asked: true })).toBe("skip");
});

test("a denied permission is not re-prompted", () => {
  expect(
    nextAutoPushAction({
      ...signedIn,
      granted: false,
      permission: "denied",
    })
  ).toBe("skip");
});

test("an explicit opt-out wins over a granted permission", () => {
  // Turning alerts off in Account has to survive the next app open, otherwise
  // the retry above would make the toggle a no-op.
  expect(nextAutoPushAction({ ...signedIn, optedOut: true })).toBe("skip");
});

test("does nothing when already registered or signed out", () => {
  expect(nextAutoPushAction({ ...signedIn, registered: true })).toBe("skip");
  expect(nextAutoPushAction({ ...signedIn, signedIn: false })).toBe("skip");
});
