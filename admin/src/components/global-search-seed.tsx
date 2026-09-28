"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { setGlobalSearch } from "@/lib/global-search";

/**
 * Makes `?q=` in the URL the source of truth for the search box, so a search
 * result is a real destination rather than a dead end: the global search links
 * to `/orders?q=KFD-1005`, and this seeds the module store that every list
 * page already filters on. No page needs to know about search params.
 *
 * Reads `window.location.search` rather than `useSearchParams()` on purpose.
 * `useSearchParams` forces every page under the dashboard layout into a
 * Suspense boundary for the static prerender, and a client-side table filter
 * has nothing to gain from being server-rendered -- the rows it filters are
 * fetched in the browser anyway.
 */
export function GlobalSearchSeed(): null {
  const pathname = usePathname();

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q") ?? "";
    // Also the reset path: navigating from /orders?q=x to /orders via the
    // sidebar must drop the filter rather than leave the list stuck.
    setGlobalSearch(q);
  }, [pathname]);

  return null;
}
