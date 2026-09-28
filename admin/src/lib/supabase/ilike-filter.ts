/**
 * PostgREST filter-string construction.
 *
 * Separate from `queries.ts` so it can be unit tested: that module creates a
 * Supabase client at import time, which needs browser env, so anything
 * imported from it is untestable under `node --test`.
 */

/**
 * Escapes the characters that are special to PostgREST's filter parser and to
 * `ilike`, so a user's text is matched literally.
 *
 * PostgREST has no bind parameters inside `or()`, so the term is interpolated
 * into the filter string and the server parses it. Left alone that is a real
 * injection surface, and a quiet one:
 *
 *   "50%"      -> "%50%%" is a wildcard matching every row
 *   "a_b"      -> matches any "a", then any character, then any "b"
 *   "x,y"      -> splits into two OR branches, changing the whole filter
 *   "back\\"   -> escapes the closing quote or paren of the filter itself
 *
 * Backslash is the escape character for both layers, so escaping these four
 * characters is what makes the term literal.
 */
export function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_,]/g, (char) => `\\${char}`);
}

/**
 * Builds `col1.ilike.%term%,col2.ilike.%term%` for an `or()` filter.
 *
 * The pattern is built once from the escaped term and reused per column, so
 * the escaped value cannot be forgotten on one of the columns.
 */
export function anyIlikeFilter(fields: string[], term: string): string {
  const like = `%${escapeLikeTerm(term)}%`;
  return fields.map((field) => `${field}.ilike.${like}`).join(",");
}
