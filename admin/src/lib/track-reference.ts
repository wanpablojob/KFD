/**
 * Normalising what a customer types into the track box.
 *
 * The only trackable shape is the one public.track_order() serves:
 * `^#KFD-[0-9A-F]{12}$` (see admin/supabase/migrations/0012_*.sql). A customer
 * may paste it with a leading `#`, without the `KFD-` prefix, in lower case, or
 * with stray spaces copied from a message. This collapses those into the one
 * canonical form before the reference is put into a URL.
 *
 * It is deliberately strict about the 12 hex characters: a near miss should
 * land on the track page's "not found" state, not silently query the database
 * with a guess.
 */
const REFERENCE_BODY = /^[0-9A-F]{12}$/;
export const REFERENCE_PATTERN = /^#KFD-[0-9A-F]{12}$/;

export function normalizeReference(input: string): string | null {
  // Upper-case first so the character class matches, then strip every space so
  // a reference broken across two lines still resolves.
  const cleaned = input.trim().replace(/\s+/g, "").toUpperCase();
  const body = cleaned.replace(/^#?KFD-?/, "");

  if (!REFERENCE_BODY.test(body)) return null;
  return `#KFD-${body}`;
}
