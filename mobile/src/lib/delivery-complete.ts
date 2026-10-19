/**
 * Completing a delivery with proof (0079).
 *
 * The ordering here is the part that matters and is not arbitrary. The photo is
 * uploaded FIRST, and only then is rider_mark_delivered called with the path the
 * upload returned. The server verifies the object exists before it will close
 * the order, so this is what makes "proof of delivery" mean anything.
 *
 * Doing it the other way round would mean accepting a path the server has never
 * seen, and an order could be closed against a file that was never written. The
 * failure this buys us is at worst an orphaned image in the bucket, which costs
 * a few kilobytes; the other ordering loses the guarantee the feature exists for.
 */

import { supabase } from "./supabase";
import {
  PROOF_BUCKET,
  proofPath,
  validateCompletion,
  type CompletionInput,
  type FieldError,
} from "./delivery-proof";

export interface CompleteResult {
  /** What was actually recorded. Null on a wallet order, where the customer
   *  paid the rider's own GCash and the platform held no cash. */
  cashRecorded: number | null;
  /** True when the amount disagreed with the total and was flagged. */
  flagged: boolean;
  /** Echoed back so the screen does not have to guess which order it closed. */
  orderId: string;
}

export class CompletionError extends Error {
  readonly field?: FieldError;
  constructor(message: string, field?: FieldError) {
    super(message);
    this.name = "CompletionError";
    this.field = field;
  }
}

/**
 * Upload the photo, then close the delivery.
 *
 * The riderId is passed in rather than looked up here: the screen already has
 * the profile it is rendering (useRiderProfile), and a second round trip at the
 * customer's door on a weak connection is a second way for this to fail.
 */
export async function completeDelivery(
  riderId: string,
  input: CompletionInput
): Promise<CompleteResult> {
  const check = validateCompletion(input);
  if (!check.ok) {
    throw new CompletionError(check.error ?? "photo-required", check.error);
  }

  const photoUri = input.photoUri as string;
  const mime = mimeFromUri(photoUri);
  const path = proofPath(riderId, input.orderId, mime);

  // 1. Upload first. `upsert: false` so a retry cannot silently overwrite the
  //    photo that belongs to an already-closed delivery.
  const asset = await fetch(photoUri);
  if (!asset.ok) {
    throw new CompletionError(
      "Could not read that photo. Take it again.",
      "photo-required"
    );
  }
  const blob = await asset.blob();

  const { error: uploadError } = await supabase.storage
    .from(PROOF_BUCKET)
    .upload(path, blob, { contentType: mime, upsert: false });

  // Already there means an earlier attempt uploaded it and then lost the RPC;
  // reuse it, or a retry at the door could never get past this step.
  if (uploadError && !isAlreadyUploaded(uploadError)) {
    throw new CompletionError(
      "Could not upload the delivery photo. Check your connection and try again.",
      "photo-required"
    );
  }

  // 2. Only now close the order. A duplicate is reported plainly rather than
  //    swallowed: the delivery genuinely completed on the first attempt, and
  //    the rider deserves to know the retry was redundant.
  // Both money fields are OMITTED rather than sent as null. They are optional in
  // the generated types, and PostgREST treats a missing key as "use the default",
  // which is null anyway -- but passing null explicitly would narrow the type
  // and change nothing at runtime.
  const { error } = await supabase.rpc("rider_mark_delivered", {
    p_order_id: input.orderId,
    p_proof_path: path,
    p_cash_collected: check.cash,
    p_gcash_reference: check.reference || undefined,
  });

  if (error) {
    // The photo is already in the bucket and the order is still open. That is a
    // recoverable state -- the next attempt reuses the same path and the RPC
    // closes the order -- so the message says so instead of implying the
    // delivery is lost.
    throw new CompletionError(error.message);
  }

  return {
    orderId: input.orderId,
    cashRecorded: check.cash ?? null,
    flagged: Boolean(check.warning),
  };
}

function isAlreadyUploaded(error: { statusCode?: string; code?: string }): boolean {
  return error.statusCode === "409" || error.code === "ResourceAlreadyExists";
}

function mimeFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

/** Short-lived read URL for the rider's own proof. The bucket is private. */
export async function proofUrl(path: string, seconds = 900): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(path, seconds);
  if (error) return null;
  return data.signedUrl;
}
