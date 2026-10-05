"use client";

import { useSyncExternalStore } from "react";

/**
 * Matches a Tailwind breakpoint from JS.
 *
 * The riders list renders a table on wide screens and stacked cards below `md`,
 * which is a layout decision Tailwind alone can make -- except the two need
 * different *DOM*, not just different classes. Rendering both and hiding one with
 * `hidden md:block` would put every control in the document twice: duplicate
 * form ids, and a screen reader announcing two copies of the same table.
 *
 * Subscribing rather than reading window.matchMedia during render, so the first
 * paint is already correct instead of flashing the table on a phone.
 *
 * Not a dependency: this is twenty lines and matchMedia is already in the
 * platform.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () =>
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(query).matches
        : false,
    // Server render assumes wide. The tables are the primary representation and
    // the dashboard is not being indexed, so a brief mobile mismatch on
    // hydration is preferable to rendering nothing for a client-only branch.
    () => true,
  );
}

/** Matches Tailwind's `md` breakpoint, where the riders table becomes cards. */
export const MD_AND_UP = "(min-width: 768px)";