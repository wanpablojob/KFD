/**
 * Address validation, kept free of storage and native imports so it is
 * testable and reusable from both the checkout and any future signup flow.
 * Mirrors the split in lib/auth.ts (native) vs lib/auth-errors.ts (pure).
 */

export const ADDRESS_LIMIT = 6;

/**
 * Minimum bar for a deliverable address in the Philippines: a house or
 * building number and a barangay, because that is what the rider navigates by
 * and what the delivery zone is defined in terms of. The city is prefilled to
 * Kabankalan and need not be retyped.
 */
const HOUSE_NUMBER = /\d/;
const BARANGAY = /\b(barangay|brgy|blk|block|purok|sitio)\b/i;

export interface AddressProblem {
  field: "address";
  message: string;
}

export function validateAddress(raw: string): AddressProblem | null {
  const value = normaliseAddress(raw);
  if (!value) return { field: "address", message: "Enter a delivery address." };
  if (value.length < 8) {
    return {
      field: "address",
      message: "Add more detail, for example “12 Katipunan St., Barangay Poblacion”.",
    };
  }
  if (!HOUSE_NUMBER.test(value)) {
    return { field: "address", message: "Include your house or building number." };
  }
  if (!BARANGAY.test(value)) {
    return {
      field: "address",
      message: "Include your barangay so the rider can find you.",
    };
  }
  return null;
}

export function normaliseAddress(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * The address as it is stored and shown: what the customer typed, plus the
 * barangay they picked when they did not type it. The server prices by the
 * barangay name and the rider needs that same name on the address, so a single
 * tap on a saved address has to carry both.
 */
export function completeAddress(raw: string, barangay?: string | null): string {
  const base = normaliseAddress(raw).replace(/[,\s]+$/, "");
  const area = (barangay ?? "").trim();
  if (!base || !area) return base;
  if (base.toLowerCase().includes(area.toLowerCase())) return base;
  return `${base}, Barangay ${area}`;
}

export function addressLabelFor(raw: string): string {
  const match = normaliseAddress(raw).match(BARANGAY);
  if (!match) return "Saved";
  const word = match[0].replace(/^./, (c) => c.toUpperCase());
  const after = normaliseAddress(raw)
    .slice(match.index! + match[0].length)
    .trim();
  const firstWord = after.split(" ")[0];
  return firstWord ? `${word} ${firstWord}` : word;
}

/**
 * Why a contact number cannot be used, or null when it can. The rider calls
 * it at the door, so it needs enough digits to be a real Philippine mobile or
 * landline number (7 to 15 digits, spaces and dashes allowed).
 */
export function contactPhoneProblem(raw: string): string | null {
  const digits = (raw.match(/\d/g) ?? []).length;
  if (digits === 0) return "Add a contact number so your rider can reach you.";
  if (digits < 7 || digits > 15 || /[^\d\s()+-]/.test(raw.trim())) {
    return "Enter a valid contact number, e.g. 0917 123 4567.";
  }
  return null;
}
