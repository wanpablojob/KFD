/**
 * Accepts only same-origin absolute paths for post-login redirects.
 *
 * Anything else is discarded rather than followed. `?next=//evil.com` and
 * `?next=/\evil.com` are protocol-relative URLs that browsers resolve
 * off-origin, and `?next=https://evil.com` is a plain absolute URL. Following
 * any of them would turn the login page into an open redirect, which is a
 * phishing primitive on the one page a user trusts enough to type a password
 * into.
 *
 * Kept dependency-free so both the server component that reads the query
 * string and the client form that follows it can import it.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.includes("\\")) return null;
  return raw;
}
