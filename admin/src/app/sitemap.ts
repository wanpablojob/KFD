import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

/**
 * Only the public marketing pages belong in the sitemap. Tracking URLs are
 * noindex and are never listed, and the authenticated areas are excluded by
 * robots.txt.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
