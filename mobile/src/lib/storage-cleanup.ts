/**
 * Delete a photo once a newer one has replaced it (G9).
 *
 * Menu, shop and GCash QR photos were left in storage forever when replaced.
 * Each owner may delete their own (0086, 0091), so the app removes the old
 * object right after the new one is saved -- never before, so a failed save
 * cannot leave a shop or rider with no photo. Best-effort: a leftover file
 * costs a few kilobytes, a thrown error here would cost the save.
 */

import { supabase } from "./supabase";

/** The object path inside `bucket` for one of its public URLs, else null. */
export function storagePathFromPublicUrl(
  url: string | null,
  bucket: string
): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const at = url.indexOf(marker);
  if (at < 0) return null;
  const path = decodeURIComponent(url.slice(at + marker.length).split("?")[0]);
  // Only a plain path in the bucket: no climbing out of the owner's folder.
  return path && !path.split("/").includes("..") ? path : null;
}

export async function removeReplacedImage(
  bucket: string,
  oldUrl: string | null,
  newUrl: string | null
): Promise<void> {
  if (!oldUrl || oldUrl === newUrl) return;
  const path = storagePathFromPublicUrl(oldUrl, bucket);
  if (!path) return;
  try {
    await supabase.storage.from(bucket).remove([path]);
  } catch {
    // housekeeping only
  }
}
