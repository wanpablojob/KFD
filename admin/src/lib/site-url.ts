/**
 * The canonical origin, used for metadata, the sitemap and robots.txt.
 *
 * Prefers an explicit NEXT_PUBLIC_SITE_URL, falls back to the Vercel-provided
 * deployment URL, then localhost. The owner should set NEXT_PUBLIC_SITE_URL to
 * the real production domain so shared links and the sitemap do not point at a
 * preview host.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
).replace(/\/+$/, "");
