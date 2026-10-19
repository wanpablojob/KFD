/** Why a reset form cannot be sent yet, or null when it can. Same rules as sign-up. */
export function resetFormError(
  code: string,
  password: string,
  confirm: string
): string | null {
  if (!/^\d{6}$/.test(code.trim())) return "Enter the 6-digit code from the email.";
  if (password.length < 6) return "Password must be at least 6 characters.";
  if (password !== confirm) return "Passwords do not match.";
  return null;
}
