import type { NextConfig } from "next";

/**
 * Baseline response headers.
 *
 * Note what is deliberately absent: `default-src` and `script-src`. Next
 * injects inline bootstrap scripts, and a CSP without per-request nonces would
 * either break the app or require `'unsafe-inline'`, which buys no protection
 * against XSS. The directives below block the attacks that do not need
 * script execution, so they are safe to enforce unconditionally.
 *
 *   frame-ancestors  -> clickjacking. Paired with X-Frame-Options for older UAs.
 *   object-src       -> stops <object>/<embed> plugin content.
 *   base-uri         -> stops a injected <base> rewriting every relative URL.
 *   form-action      -> stops a form being POSTed to an attacker's origin.
 */
const contentSecurityPolicy = [
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    // The portal is text, forms and CSV. It needs no device access, so deny it.
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
