"use client";

import { useCallback, useEffect, useState } from "react";
import { useGlobalSearch } from "@/lib/global-search";
import {
  parseRiderListParams,
  riderListParamsToSearch,
  viewChangeResetsPage,
  type RiderListParams,
} from "@/lib/rider-list-params";

/**
 * Keeps the riders list's filter, search, sort and page in the query string.
 *
 * Reads `window.location` directly rather than `useSearchParams`, for the same
 * reason GlobalSearchSeed does: `useSearchParams` pushes every page under the
 * dashboard layout into a Suspense boundary for the static prerender, and a
 * client-side table filter gains nothing from being server-rendered.
 *
 * One owner per concern, which is the whole trick:
 *
 *   * The global search store owns `q`. It is what the visible search box is
 *     bound to, so making the URL a second authority would let the box and the
 *     URL disagree. This hook only mirrors the store into the URL.
 *   * Local state owns filter / sort / dir / page.
 *
 * The mirroring effect writes history and never state, so it cannot loop.
 */
export function useRiderListView() {
  const globalQuery = useGlobalSearch();

  const [view, setView] = useState(() =>
    parseRiderListParams(
      typeof window === "undefined" ? "" : window.location.search,
    ),
  );

  const set = useCallback((patch: Partial<RiderListParams>) => {
    setView((current) => {
      const merged = { ...current, ...patch };
      // A patch that narrows or reorders the rows has to return to page 1.
      // Left to the caller this is a bug that only appears once somebody is on
      // page 3 and clicks a status card.
      return viewChangeResetsPage(current, merged)
        ? { ...merged, page: 1 }
        : merged;
    });
  }, []);

  // Back/forward, and any link landing on this page. replaceState above creates
  // no history entries, so this mostly fires for navigation the admin did not
  // make through these controls -- but a shared link that was opened and then
  // navigated away from must not come back stale.
  useEffect(() => {
    const onPopState = () =>
      setView(parseRiderListParams(window.location.search));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Single write of the whole query string, derived from both owners. Runs when
  // either changes, so typing in the search box and clicking a status card both
  // land in the URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.history.replaceState(
      null,
      "",
      riderListParamsToSearch({ ...view, query: globalQuery }),
    );
  }, [view, globalQuery]);

  return { params: { ...view, query: globalQuery }, set } as const;
}