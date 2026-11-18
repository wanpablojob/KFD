/**
 * One thing the signed-out visitor asked for, carried across sign-up.
 *
 * "Ride with Meriendash" on the landing has to end on the rider application,
 * but the form needs an account (the application is tied to auth.uid()), and
 * a new account lands on the customer home. The landing records the intent;
 * the customer section opens the form once and clears it.
 */
type Intent = "rider-apply";

let pending: Intent | null = null;

export function setPendingIntent(intent: Intent): void {
  pending = intent;
}

/** The pending intent, cleared as it is read so it fires once. */
export function takePendingIntent(): Intent | null {
  const intent = pending;
  pending = null;
  return intent;
}
