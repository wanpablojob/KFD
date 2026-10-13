/**
 * Should a sign-out still unregister this device from the push server?
 *
 * `getPushStatus()` returns two flags read from two different places:
 *
 *   granted     -- the *live* OS permission, from Notifications.getPermissionsAsync()
 *   registered  -- a local marker in SecureStore, set only after the server
 *                  accepted the token
 *
 * The three account screens gated their sign-out cleanup on
 * `push.granted && push.registered`. That reads as "the toggle is on", which is
 * what the two flags jointly mean for the *switch* -- and is exactly wrong for
 * cleanup.
 *
 * The two flags drift apart, and the drift is ordinary rather than exotic:
 *
 *   - The user revokes notifications in iOS/Android Settings while the app is
 *     installed. `granted` goes false; SecureStore still says registered, and
 *     the server still holds the token.
 *   - On Android 13+ the permission can be downgraded or auto-revoked.
 *   - `disablePush` deletes REGISTERED_KEY before the network call, so a failed
 *     or offline unregister clears the local marker while the server row
 *     survives -- leaving `registered` false with a live row behind it.
 *
 * In every one of those cases the AND is false, the screens skip
 * `disablePush`, and the token stays in `push_tokens` against a signed-out
 * user. The next person to sign in on that handset keeps getting the previous
 * rider's delivery-completed alerts and dispatch offers: order references and
 * a restaurant name, delivered to someone who has left. DELETE /api/push/register
 * exists precisely to stop that, and the one moment it matters most is sign-out.
 *
 * So cleanup is keyed on the server-side fact -- "did we ever register this
 * device?" -- and deliberately ignores the OS permission. Revoking permission
 * does not unregister a token, and only the DELETE does.
 */

/** The subset of PushStatus this decision needs. */
export interface PushRegistrationState {
  /** Live OS permission. Not evidence about the server. */
  granted: boolean;
  /** Local marker: this install completed a registration at some point. */
  registered: boolean;
}

/**
 * True when a sign-out must call DELETE /api/push/register.
 *
 * `registered` alone is sufficient and necessary:
 *
 *   - registered            -> a row may exist; deleting is idempotent, so an
 *                             already-gone row costs nothing.
 *   - not registered        -> this install never registered, so there is
 *                             nothing of ours to remove. Even if a row somehow
 *                             exists, it is not ours to delete here.
 *
 * `granted` is accepted but unused by design, and is part of the argument so a
 * caller cannot "simplify" it back into the AND that caused this.
 */
export function shouldUnregisterOnSignOut(state: PushRegistrationState): boolean {
  void state.granted;
  return state.registered;
}
