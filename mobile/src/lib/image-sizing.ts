/**
 * How wide an uploaded photo may be.
 *
 * A phone camera takes 12 megapixels, so a photo of a plate of food is 1-2 MB
 * before anything happens to it. Every one of those photos is uploaded whole:
 * over a rural connection the upload takes a minute, the merchant waits, and
 * the bucket fills with copies of the same plate at four times the size it
 * needs to be. 800px is wide enough for the card a photo appears on.
 *
 * Kept apart from the module that does the resizing, because that one needs
 * the native image module and this one has to be testable without it.
 */

/** The width a photo is uploaded at. */
export const UPLOAD_MAX_WIDTH = 800;

/**
 * The width to resize to, or null to upload the photo as it is.
 *
 * null means "leave it alone": the photo is already narrow enough, and
 * enlarging it would only make it blurrier. An unknown width is also left
 * alone, because guessing would be worse than uploading the original.
 */
export function targetWidthFor(
  width: number,
  max: number = UPLOAD_MAX_WIDTH
): number | null {
  if (!Number.isFinite(width) || width <= 0) return null;
  if (width <= max) return null;
  return max;
}
