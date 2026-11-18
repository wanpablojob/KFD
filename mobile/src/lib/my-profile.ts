/**
 * A customer's or rider's own name and profile photo (0157).
 *
 * The photo is uploaded to the public `avatars` bucket under the person's own
 * login id (the storage policy checks that folder), then saved with the name
 * through update_my_profile, which also writes it to the login's metadata. The
 * session is refreshed afterwards so every screen reading the user sees it.
 */
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { gcashQrFile } from "./gcash-qr";
import { uploadLocalImage } from "./image-upload";

export const AVATARS_BUCKET = "avatars";
const MAX_BYTES = 5 * 1024 * 1024;

/** `<userId>/<time>-<random>.<ext>`: a fresh name each time, so nothing is overwritten. */
export function avatarPath(
  userId: string,
  uri: string,
  now = Date.now(),
  random = Math.random()
): string {
  const id = userId.trim();
  if (!id) throw new Error("Sign in to change your photo.");
  const { ext } = gcashQrFile(uri);
  const suffix = random.toString(36).slice(2, 8).padEnd(6, "0");
  return `${id}/${now.toString(36)}-${suffix}.${ext}`;
}

/** The name to show: the one they chose, else their sign-in name, else their email. */
export function displayNameOf(user: User | null, fallback = "Customer"): string {
  const meta = user?.user_metadata ?? {};
  for (const key of ["display_name", "name", "full_name"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return user?.email?.split("@")[0] || fallback;
}

/** Their chosen photo, else the one from Google, else none. */
export function photoOf(user: User | null): string | null {
  const meta = user?.user_metadata ?? {};
  for (const key of ["photo_url", "avatar_url", "picture"]) {
    const value = meta[key];
    if (typeof value === "string" && /^https:\/\//.test(value)) return value;
  }
  return null;
}

export async function uploadAvatar(userId: string, uri: string): Promise<string> {
  const { contentType } = gcashQrFile(uri);
  const path = avatarPath(userId, uri);
  const outcome = await uploadLocalImage({
    bucket: AVATARS_BUCKET,
    path,
    uri,
    contentType,
    maxBytes: MAX_BYTES,
  });
  if (!outcome.ok) {
    const { kind, detail } = outcome.failure;
    if (kind === "unreadable")
      throw new Error("Could not read that photo. Pick it again.");
    if (kind === "too-large")
      throw new Error("That photo is too large. Choose a smaller one.");
    if (/bucket.*not found/i.test(detail)) {
      throw new Error("Profile photos are not available yet. Try again later.");
    }
    throw new Error(
      "Could not upload your photo. Check your connection and try again."
    );
  }
  return supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function saveMyProfile(
  name: string,
  photoUrl: string | null
): Promise<void> {
  const { error } = await supabase.rpc("update_my_profile", {
    p_name: name,
    p_photo_url: photoUrl ?? undefined,
  });
  if (error) throw new Error(error.message);
  // The new name and photo live in the login's metadata: refresh the session so
  // the screens reading `user` show them now, not at the next sign-in.
  await supabase.auth.refreshSession();
}
