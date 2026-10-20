import { supabase } from "./supabase";

/**
 * Uploading a local image to a Supabase Storage bucket from the app.
 *
 * WHY THIS FILE EXISTS
 *
 * React Native cannot upload a Blob to Storage as it stands. supabase-js wraps
 * a Blob body in a FormData, React Native serialises that into
 * multipart/form-data, and the part carries no content type of its own -- a
 * React Native Blob has an empty `type` -- so the part arrives as text/plain.
 * Every bucket in this app allows image/jpeg, image/png and image/webp only,
 * so Storage refused the file with
 *
 *     415 InvalidMimeType: mime type text/plain is not supported
 *
 * and the rider was told "Could not upload your GCash QR. Check your
 * connection and try again", which sent them looking for a network problem
 * that was never there. The delivery photo and the shop photo were broken the
 * same way; this is the one place that fixes all three.
 *
 * THE FIX
 *
 * Give the blob the content type it should have had. React Native's
 * Blob.slice(start, end, contentType) returns a view onto the same bytes with
 * the type set, and React Native's FormData copies a part's `type` into that
 * part's content-type header -- so the part now declares image/png and
 * Storage accepts it. The bytes are untouched and the file never has to be
 * read into the JavaScript heap.
 *
 * The library's own React Native note agrees that a bare Blob body is the
 * wrong shape here and suggests an ArrayBuffer instead, but React Native's
 * native networking layer does not accept an ArrayBuffer as a request body
 * either. Slicing the blob keeps the file on disk.
 */

/** A Blob carrying the content type the bucket expects. Same bytes, real type. */
export function withContentType(blob: Blob, contentType: string): Blob {
  return blob.slice(0, blob.size, contentType);
}

export type ImageUploadFailureKind = "unreadable" | "too-large" | "rejected";

export interface ImageUploadFailure {
  kind: ImageUploadFailureKind;
  /** The server's own words, for a log or a message. */
  detail: string;
  /** The raw storage error, when the server refused the file. */
  error?: { message?: string; statusCode?: string; code?: string };
}

export type ImageUploadOutcome =
  { ok: true } | { ok: false; failure: ImageUploadFailure };

export interface LocalImageUpload {
  bucket: string;
  /** Path inside the bucket. The first folder is what the RLS policy checks. */
  path: string;
  /** Local file:// or content:// URI from the image picker. */
  uri: string;
  /** A content type the bucket allows: image/jpeg, image/png or image/webp. */
  contentType: string;
  /** Refuse before uploading when the file is bigger than this. */
  maxBytes?: number;
}

/**
 * Read a local image and upload it to a bucket.
 *
 * The outcome is returned rather than thrown so each caller can keep its own
 * wording: a rider who cannot read their screenshot and a rider whose file was
 * refused by the server are different problems.
 */
export async function uploadLocalImage(
  image: LocalImageUpload
): Promise<ImageUploadOutcome> {
  const asset = await fetch(image.uri);
  if (!asset.ok) {
    return {
      ok: false,
      failure: { kind: "unreadable", detail: `could not read ${image.uri}` },
    };
  }

  const blob = await asset.blob();
  if (!blob || blob.size === 0) {
    return {
      ok: false,
      failure: { kind: "unreadable", detail: "the file was empty" },
    };
  }

  if (image.maxBytes !== undefined && blob.size > image.maxBytes) {
    return {
      ok: false,
      failure: { kind: "too-large", detail: `${blob.size} bytes` },
    };
  }

  const { error } = await supabase.storage
    .from(image.bucket)
    .upload(image.path, withContentType(blob, image.contentType), {
      contentType: image.contentType,
      upsert: false,
    });

  if (error) {
    return {
      ok: false,
      failure: {
        kind: "rejected",
        detail: error.message ?? "the file was refused",
        error,
      },
    };
  }

  return { ok: true };
}
