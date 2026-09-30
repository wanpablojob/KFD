import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

/**
 * Tracking URLs are excluded here as well as being noindex: an order reference
 * is a bearer secret and should never be crawled. The authenticated areas are
 * disallowed so search engines do not waste budget on pages a signed-out
 * visitor can only ever see as a redirect.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/track/",
        "/dashboard/",
        "/merchant/",
        "/login",
        "/auth/",
        "/api/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
