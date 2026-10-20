/**
 * GCash QR image uploads (0091).
 *
 * 0057 stored a URL, which assumed every rider had somewhere to host their QR.
 * A GCash QR is a screenshot inside the GCash app, so this is the client half of
 * the bucket that lets the rider attach that screenshot instead.
 *
 * The pure path and extension decisions live here so they can be tested without
 * a device, following delivery-proof.ts. The upload itself is next door in
 * gcash-qr-upload.ts.
 */

/** Public bucket from 0091. The first folder is the rider id, enforced by RLS. */
export const GCASH_QR_BUCKET = "gcash-qr";

/** Matches the bucket's file_size_limit in 0091. */
export const GCASH_QR_MAX_BYTES = 5 * 1024 * 1024;

export interface GcashQrFile {
  ext: "png" | "jpg" | "webp";
  contentType: "image/png" | "image/jpeg" | "image/webp";
}

/**
 * What the picker handed us. iOS may hand back a query string, and the picker
 * can uppercase; neither should decide the bucket's content type.
 */
export function gcashQrFile(uri: string): GcashQrFile {
  const lower = uri.split("?")[0].toLowerCase();
  if (lower.endsWith(".png")) return { ext: "png", contentType: "image/png" };
  if (lower.endsWith(".webp")) return { ext: "webp", contentType: "image/webp" };
  return { ext: "jpg", contentType: "image/jpeg" };
}

/**
 * Storage path for a QR. A fresh name per upload means replacing never needs an
 * UPDATE policy, and the rider id folder is exactly what 0091's RLS checks.
 */
export function gcashQrPath(
  riderId: string,
  uri: string,
  now = Date.now(),
  random = Math.random()
): string {
  const id = riderId.trim();
  if (!id) throw new Error("No rider profile is linked to this account.");

  const { ext } = gcashQrFile(uri);
  const suffix = random.toString(36).slice(2, 8).padEnd(6, "0");
  return `${id}/${now.toString(36)}-${suffix}.${ext}`;
}
