/**
 * What should happen to push registration on this app open?
 *
 * The first version of auto-enable ran "once per install": it wrote a marker and
 * then never looked again. That marker was doing two unrelated jobs -- "the OS
 * prompt has been shown" and "this device is registered" -- and they are not the
 * same question:
 *
 *   - Signing out calls disablePush(), which removes the server row and the
 *     local `registered` marker. The install stays "already asked", so a rider
 *     or merchant who signs out and back in is never registered again: the
 *     phone is hidden from dispatch and from new-order alerts, silently.
 *   - A first registration that fails (offline, token fetch timeout, server
 *     hiccup) leaves `registered` false, and the same marker meant it was never
 *     retried for the life of the install.
 *
 * So the marker only means "we have shown the OS prompt". Registration is
 * retried on every open while permission is granted and the server has not
 * accepted this device yet. `optedOut` is the user's explicit choice in Account
 * and outranks the retry.
 */

export type AutoPushAction = "skip" | "register" | "ask";

export interface AutoPushState {
  /** Signed in; without a session there is no user to register the token for. */
  signedIn: boolean;
  /** The user switched alerts off in Account on this device. */
  optedOut: boolean;
  /** Local marker: this install's token was accepted by the server. */
  registered: boolean;
  /** Live OS permission. */
  granted: boolean;
  /** Raw permission state, to tell "never asked" from "denied". */
  permission: "granted" | "denied" | "undetermined";
  /** The OS prompt has already been shown on this install. */
  asked: boolean;
}

export function nextAutoPushAction(state: AutoPushState): AutoPushAction {
  if (!state.signedIn) return "skip";
  if (state.optedOut) return "skip";
  // Already registered: nothing to do. A token rotation is handled separately.
  if (state.registered) return "skip";
  // Permission is there but the server does not have this device. That is the
  // sign-out and failed-first-attempt case -- register without a prompt.
  if (state.granted) return "register";
  // Permission is not there. Only ask when the OS has never been asked; a
  // decline is an answer, and re-prompting on every launch is nagging.
  if (state.permission === "undetermined" && !state.asked) return "ask";
  return "skip";
}
