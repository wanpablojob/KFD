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
 * Control characters are refused for the same reason, and they are the reason
 * the string tests alone were not enough: the URL parser deletes tabs and
 * newlines *before* it decides an origin, so `/\t/evil.com` parses as
 * `//evil.com` and leaves the site while passing every prefix test below.
 *
 * Kept dependency-free so both the server component that reads the query
 * string and the client form that follows it can import it.
 */

/** A fixed base used only to ask the URL parser what it would resolve. */
const PROBE_BASE = "https://kfd.invalid";

export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // C0 controls and DEL: stripped by the parser, so they can turn a path into
  // a protocol-relative URL. Refused before any other test sees the string.
  if (/[\u0000-\u001F\u007F]/.test(raw)) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.includes("\\")) return null;
  // Belt and braces. The parser, not these string tests, is what decides
  // off-origin, so ask it directly against a fixed base and insist the origin
  // survives. Any future parser quirk is caught here rather than on the login
  // page.
  try {
    if (new URL(raw, PROBE_BASE).origin !== PROBE_BASE) return null;
  } catch {
    return null;
  }
  return raw;
}
