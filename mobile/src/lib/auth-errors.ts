/**
 * Collapses Supabase's distinguishable "no such account"/"wrong password"/
 * unconfirmed emails into one reply that reveals nothing about which half of
 * the credentials was wrong. Mirrors admin/src/lib/auth.ts.
 */
const CREDENTIAL_FAILURES = ["invalid login credentials", "email not confirmed"];

export function collapseAuthError(message: string): string | null {
  const detail = message.toLowerCase();
  if (CREDENTIAL_FAILURES.some((failure) => detail.includes(failure))) {
    return "Incorrect email or password.";
  }
  return message;
}

export function isCredentialFailure(message: string): boolean {
  return CREDENTIAL_FAILURES.some((failure) => message.toLowerCase().includes(failure));
}
