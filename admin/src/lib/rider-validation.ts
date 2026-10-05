/**
 * Validation for the Add/Edit Rider dialog.
 *
 * The dialog is an EntityDialog, which only knows "required" and has no email or
 * textarea field type, so this runs on save rather than on blur. The point is
 * that an admin finds out here, with a sentence they can act on, instead of
 * reading a Postgres constraint name out of a failed request.
 */

/**
 * Philippine mobile numbers only, because the city is fixed and a rider with a
 * landline is not a case worth loosening the rule for.
 *
 * Written to accept the shape before separators are stripped, so see
 * normalisePhone() first: this is the last check, not the first.
 */
const PH_MOBILE = /^09\d{9}$/;
const PH_MOBILE_INTL = /^\+639\d{9}$/;

/**
 * Deliberately loose. RFC 5322 allows far more than any real address contains,
 * and a stricter rule rejects valid addresses; what actually needs catching is a
 * missing @, a missing domain, or a stray space.
 */
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * Strips what people actually type into a phone field: spaces, dashes, dots and
 * parentheses. "+63 (917) 123-4567" and "09171234567" are the same number, and
 * rejecting the first because of its punctuation would be a false alarm.
 */
export function normalisePhone(value: string): string {
  return value.replace(/[\s\-().]/g, "");
}

export function isValidEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

export function isValidPhMobile(value: string): boolean {
  const digits = normalisePhone(value);
  return PH_MOBILE.test(digits) || PH_MOBILE_INTL.test(digits);
}

export interface RiderFieldError {
  field: "name" | "email" | "phone" | "city";
  message: string;
}

/**
 * `editingEmail` is the row being edited, so saving a rider without touching
 * their email is not reported as a duplicate of themselves.
 */
export function validateRiderFields(
  input: { name: string; email: string; phone: string; city: string },
  existingEmails: readonly string[],
  editingEmail?: string | null,
): RiderFieldError[] {
  const errors: RiderFieldError[] = [];
  const email = input.email.trim();
  const city = input.city.trim();

  if (!input.name.trim()) {
    errors.push({ field: "name", message: "Enter the rider's name." });
  }

  if (!email) {
    errors.push({ field: "email", message: "Enter an email address." });
  } else if (!isValidEmail(email)) {
    errors.push({
      field: "email",
      message: "That does not look like an email address.",
    });
  } else {
    const taken = existingEmails.some(
      (existing) =>
        existing.trim().toLowerCase() === email.toLowerCase() &&
        existing.trim().toLowerCase() !== (editingEmail ?? "").toLowerCase(),
    );
    if (taken) {
      errors.push({
        field: "email",
        message: "Another rider already uses this email address.",
      });
    }
  }

  if (!city) {
    errors.push({ field: "city", message: "Enter a city." });
  }

  if (!isValidPhMobile(input.phone)) {
    errors.push({
      field: "phone",
      message: "Enter a Philippine mobile number, 09XXXXXXXXX or +639XXXXXXXXX.",
    });
  }

  return errors;
}

/**
 * Postgres reports a duplicate email as a 23505 whose `message` names whichever
 * unique index fired. Neither the code nor the text is stable enough to show an
 * admin, so this recognises the shape and returns a sentence instead.
 *
 * Returns null for anything it does not recognise, which lets the caller fall
 * back to the real message rather than swallowing an unrelated failure behind a
 * vague "something went wrong".
 */
export function friendlyRiderSaveError(cause: unknown): string | null {
  const message =
    cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  if (!message) return null;

  const isUniqueViolation =
    /23505/.test(message) ||
    /duplicate key value violates unique constraint/i.test(message) ||
    /already exists/i.test(message);

  if (isUniqueViolation) {
    return "Another rider already uses this email address.";
  }

  return null;
}