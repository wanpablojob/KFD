import { supabase } from "./supabase";
import {
  GCASH_QR_BUCKET,
  GCASH_QR_MAX_BYTES,
  gcashQrFile,
  gcashQrPath,
} from "./gcash-qr";
import { uploadLocalImage } from "./image-upload";

/**
 * Upload the rider's chosen QR screenshot and return its public URL (0091).
 *
 * The caller saves the URL through rider_set_gcash only after this resolves, so
 * a failed upload never leaves the profile pointing at an object that was not
 * written. The reverse failure -- an upload with no saved URL -- is an orphaned
 * image, which costs a few kilobytes.
 *
 * The upload itself goes through uploadLocalImage: a bare Blob body reaches
 * Storage as a multipart part with no content type, and the bucket refuses
 * anything that is not an image. See the note there.
 *
 * shortcut: replacing or removing a QR leaves the previous object in the
 * bucket; add cleanup if storage use ever matters.
 */
export async function uploadGcashQr(riderId: string, uri: string): Promise<string> {
  const { contentType } = gcashQrFile(uri);
  const path = gcashQrPath(riderId, uri);

  const outcome = await uploadLocalImage({
    bucket: GCASH_QR_BUCKET,
    path,
    uri,
    contentType,
    maxBytes: GCASH_QR_MAX_BYTES,
  });

  if (!outcome.ok) {
    const { kind, detail } = outcome.failure;

    if (kind === "unreadable") {
      throw new Error("Could not read that image. Pick it again.");
    }
    if (kind === "too-large") {
      throw new Error("That image is too large. Choose a smaller screenshot.");
    }
    // The app can ship before 0091 is applied. Say that plainly rather than
    // sending the rider to "check your connection" for a server-side gap.
    if (/bucket.*not found/i.test(detail)) {
      throw new Error("GCash QR uploads are not available yet. Try again later.");
    }
    throw new Error(
      "Could not upload your GCash QR. Check your connection and try again."
    );
  }

  return supabase.storage.from(GCASH_QR_BUCKET).getPublicUrl(path).data.publicUrl;
}
