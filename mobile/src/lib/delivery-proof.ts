/**
 * Completing a delivery with proof (0079).
 *
 * Marking delivered used to be one tap that took no evidence, so "delivered"
 * was an assertion with nothing behind it. It now needs three things, and this
 * module is the client half of that contract:
 *
 *   photo    every delivery, without exception
 *   cash     the amount taken, on a cash order
 *   reference the GCash reference, on an e_wallet order
 *
 * The pure decisions live here rather than in the screen so they can be tested
 * without a device, following the pattern in cart-logic.ts and offer-claimable.ts.
 *
 * ORDER OF OPERATIONS, which is not arbitrary. The photo is uploaded FIRST and
 * the RPC is called with the resulting path. If it went the other way the
 * server would have to accept a path it cannot see yet, and a delivery could be
 * closed with a file that was never written. Uploading first costs at worst an
 * orphaned image in the bucket, which costs nothing; closing a delivery with no
 * proof costs the whole point of the feature.
 */

/** What the rider must supply, derived from how the customer paid. */
export type PaymentKind = "cash" | "e_wallet" | "card";

export interface CompletionInput {
  orderId: string;
  payment: PaymentKind;
  /** Order total, used to warn before submitting a mismatched amount. */
  orderTotal: number;
  /** Local file:// or content:// URI from the image picker. */
  photoUri?: string | null;
  /** Typed by the rider on a cash order. */
  cashCollected?: string | null;
  /** Typed by the rider on an e_wallet order. */
  gcashReference?: string | null;
}

export type FieldError =
  | "photo-required"
  | "cash-required"
  | "cash-invalid"
  | "cash-negative"
  | "reference-invalid";

export interface ValidationResult {
  ok: boolean;
  /** First blocking problem, for the field it belongs to. */
  error?: FieldError;
  /** Non-blocking. A mismatch is recorded and flagged, never refused. */
  warning?: string;
  /** Parsed cash, present only when payment is cash and the value parses. */
  cash?: number;
  /** Normalised GCash reference, uppercase and trimmed. */
  reference?: string;
}

/**
 * GCash references are 13 digits in the common case, but the format has varied
 * and a bank-side prefix is not always present. So this only rejects what is
 * unambiguously wrong -- empty, or characters that cannot appear in one -- and
 * never invents a length rule the payment provider might change.
 */
const REFERENCE_ALLOWED = /^[A-Za-z0-9-]+$/;

export function parseCash(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  // Strip only formatting a keypad adds -- currency symbols, thousands
  // separators, spaces. The minus sign is deliberately PRESERVED: stripping it
  // would turn "-50" into 50, and a negative collection would be silently
  // recorded as a positive one. Keeping it lets validateCompletion reject it.
  const cleaned = raw.replace(/[^0-9.-]/g, "").replace(/^-?\.+$/, "");
  if (cleaned === "" || !/\d/.test(cleaned)) return null;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * Decides whether a completion may be submitted, and says what is missing.
 *
 * A cash amount that disagrees with the total is a WARNING, never an error.
 * The food has physically changed hands and the money is in the rider's pocket;
 * blocking would strand a real, finished delivery to protect a number. The
 * server records both and flags the variance for an operator, which is also the
 * only version of this that can be reconstructed later.
 */
export function validateCompletion(input: CompletionInput): ValidationResult {
  const hasPhoto = Boolean(input.photoUri && input.photoUri.trim() !== "");

  if (input.payment === "cash") {
    const cash = parseCash(input.cashCollected);

    if (cash === null) {
      return { ok: false, error: "cash-required" };
    }
    if (cash < 0) {
      return { ok: false, error: "cash-negative" };
    }
    if (!hasPhoto) {
      return { ok: false, error: "photo-required" };
    }

    const differs = Math.abs(cash - input.orderTotal) > 0.005;
    return {
      ok: true,
      cash,
      warning: differs
        ? `Order total is ${input.orderTotal.toFixed(2)}. You entered ${cash.toFixed(
            2
          )}. This will be saved and flagged for review.`
        : undefined,
    };
  }

  if (input.payment === "e_wallet") {
    if (!hasPhoto) {
      return { ok: false, error: "photo-required" };
    }
    const reference = (input.gcashReference ?? "").trim().toUpperCase();
    // Absent is allowed: the server flags it rather than refusing, because a
    // rider at a door with a customer who has no reference must still be able
    // to finish. Malformed is not the same as absent, so that is rejected here.
    if (reference !== "" && !REFERENCE_ALLOWED.test(reference)) {
      return { ok: false, error: "reference-invalid" };
    }
    return { ok: true, reference };
  }

  // 'card' is unreachable for new orders (0076 refuses it) but exists in the
  // enum. Proof is still required, and there is no money direction to record.
  if (!hasPhoto) {
    return { ok: false, error: "photo-required" };
  }
  return { ok: true };
}

export const FIELD_MESSAGES: Record<FieldError, string> = {
  "photo-required": "Take a photo of the delivery before completing it.",
  "cash-required": "Enter the cash you collected.",
  "cash-invalid": "Enter the amount as a number.",
  "cash-negative": "Cash collected cannot be negative.",
  "reference-invalid":
    "A GCash reference is only letters, numbers and dashes. Leave it blank if you do not have one.",
};

/** Storage path for a delivery photo. The leading folder is the rider id. */
export function proofPath(riderId: string, orderId: string, mime: string): string {
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  return `${riderId}/${orderId}.${ext}`;
}

/** The bucket is private, so this is a short-lived read URL, not a public one. */
export const PROOF_BUCKET = "delivery-proofs";
