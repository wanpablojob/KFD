import { supabase } from "./supabase";
import {
  GCASH_QR_BUCKET,
  GCASH_QR_MAX_BYTES,
  gcashQrFile,
  gcashQrPath,
} from "./gcash-qr";

/**
 * Upload the rider's chosen QR screenshot and return its public URL (0091).
 *
 * The caller saves the URL through rider_set_gcash only after this resolves, so
 * a failed upload never leaves the profile pointing at an object that was not
 * written. The reverse failure -- an upload with no saved URL -- is an orphaned
 * image, which costs a few kilobytes.
 *
 * shortcut: replacing or removing a QR leaves the previous object in the
 * bucket; add cleanup if storage use ever matters.
 */
export async function uploadGcashQr(riderId: string, uri: string): Promise<string> {
  const { contentType } = gcashQrFile(uri);
  const path = gcashQrPath(riderId, uri);

  const asset = await fetch(uri);
  if (!asset.ok) {
    throw new Error("Could not read that image. Pick it again.");
  }

  const blob = await asset.blob();
  if (blob.size === 0) {
    throw new Error("That image could not be read. Pick it again.");
  }
  if (blob.size > GCASH_QR_MAX_BYTES) {
    throw new Error("That image is too large. Choose a smaller screenshot.");
  }

  const { error } = await supabase.storage
    .from(GCASH_QR_BUCKET)
    .upload(path, blob, { contentType, upsert: false });

  if (error) {
    // The app can ship before 0091 is applied. Say that plainly rather than
    // sending the rider to "check your connection" for a server-side gap.
    if (/bucket.*not found/i.test(error.message)) {
      throw new Error("GCash QR uploads are not available yet. Try again later.");
    }
    throw new Error(
      "Could not upload your GCash QR. Check your connection and try again."
    );
  }

  return supabase.storage.from(GCASH_QR_BUCKET).getPublicUrl(path).data.publicUrl;
}
