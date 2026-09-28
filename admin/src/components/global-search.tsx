"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon, XIcon } from "./ui/icons";
import { setGlobalSearch, useGlobalSearch } from "@/lib/global-search";
import {
  SEARCH_ENTITY_LABELS,
  searchEverything,
  type SearchResult,
} from "@/lib/supabase/queries";

const DEBOUNCE_MS = 250;

/** Kept in step with `searchEverything`; below it, nothing is worth showing. */
const MIN_TERM_LENGTH = 2;

/**
 * The WAI-ARIA combobox pattern: DOM focus never leaves the input, and the
 * active option is communicated with `aria-activedescendant`.
 *
 * The obvious alternative -- move focus into the list, then focus back to the
 * input on close -- costs a ref, two effect paths and an awkward case where
 * focus is nowhere at all when the list closes. `aria-activedescendant` gets
 * the same screen-reader behaviour for free and cannot lose focus, because it
 * never had it.
 */
export function GlobalSearch() {
  const router = useRouter();
  const query = useGlobalSearch();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  /**
   * Results are stored with the term they were fetched for, and the popover
   * only shows them when that term is still the one on screen. This is how a
   * stale response is made harmless without clearing state in the effect:
   * deleting back down to one character hides the popover by derivation, so
   * the effect body never has to call setState synchronously.
   */
  const [settled, setSettled] = useState<{
    term: string;
    results: SearchResult[];
    error: string | null;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const statusId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  const term = query.trim();
  const isCurrent = settled?.term === term;
  const results = isCurrent ? settled.results : [];
  const error = isCurrent ? settled.error : null;
  /** Nothing is searchable below two characters, so there is nothing to show. */
  const searchable = term.length >= MIN_TERM_LENGTH;
  const popoverOpen = open && searchable;

  useEffect(() => {
    if (!searchable) return;

    let stale = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const found = await searchEverything(term);
        if (stale) return;
        setSettled({ term, results: found, error: null });
        setActive(0);
        setOpen(true);
      } catch (cause) {
        if (stale) return;
        setSettled({
          term,
          results: [],
          error: cause instanceof Error ? cause.message : "Search is unavailable.",
        });
        setOpen(true);
      } finally {
        if (!stale) setLoading(false);
      }
    }, DEBOUNCE_MS);

    // Two jobs: cancel the pending request, and mark any in-flight one stale
    // so a slow response for "DD" cannot overwrite the results for "D & D".
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [searchable, term]);

  // A click anywhere else, including on the page background, dismisses the
  // popover. This is a document listener rather than onBlur because Chrome
  // reports relatedTarget === null when a link is pressed, so a blur-based
  // close would tear down the list before its own click landed.
  useEffect(() => {
    if (!popoverOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [popoverOpen]);

  function activate(result: SearchResult) {
    setOpen(false);
    setGlobalSearch("");
    router.push(result.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      // First Escape closes the list and leaves the text alone, so a second
      // one is not needed to get out of a search. The next Escape, with the
      // list already closed, clears the field like a native search input.
      if (popoverOpen) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      } else if (query) {
        event.preventDefault();
        setGlobalSearch("");
      }
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (results.length === 0) return;
      event.preventDefault();
      if (!popoverOpen) {
        setOpen(true);
        setActive(event.key === "ArrowDown" ? 0 : results.length - 1);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (index + step + results.length) % results.length);
      return;
    }

    if (event.key === "Enter" && popoverOpen && results[active]) {
      event.preventDefault();
      activate(results[active]);
    }
  }

  return (
    <div className="relative hidden max-w-md flex-1 sm:block" ref={containerRef}>
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={query}
        onChange={(event) => setGlobalSearch(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search orders, restaurants, riders…"
        role="combobox"
        aria-expanded={popoverOpen}
        aria-controls={popoverOpen ? listId : undefined}
        aria-describedby={statusId}
        aria-autocomplete="list"
        aria-activedescendant={
          popoverOpen && active >= 0 && active < results.length
            ? optionId(active)
            : undefined
        }
        aria-label="Search orders, restaurants, riders, customers and menu items"
        className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/25"
      />
      {query ? (
        <button
          type="button"
          onClick={() => setGlobalSearch("")}
          className="absolute right-2.5 top-1/2 z-10 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Clear search"
        >
          <XIcon className="h-4 w-4" />
        </button>
      ) : null}

      {/* Announced on every settled search, and separate from the popover so a
          result arriving under a closing popover is still reported. */}
      <span id={statusId} role="status" aria-live="polite" className="sr-only">
        {loading
          ? "Searching"
          : error
            ? "Search failed"
            : popoverOpen
              ? results.length === 1
                ? "1 result available"
                : `${results.length} results available`
              : ""}
      </span>

      {popoverOpen ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          {error ? (
            <p className="px-3 py-2.5 text-sm text-destructive">{error}</p>
          ) : loading ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">
              Searching…
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">
              Nothing matched “{query.trim()}”.
            </p>
          ) : (
            <ul
              id={listId}
              role="listbox"
              aria-label="Search results"
              className="max-h-80 overflow-y-auto py-1"
            >
              {results.map((result, index) => (
                <li
                  key={`${result.entity}-${result.id}`}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  /** Readable from the outside, so the entity mix of a result
                      set is assertable without scraping the label text. */
                  data-entity={result.entity}
                  // Pressing the pointer must not blur the input, or the
                  // combobox would lose focus and the keyboard contract with
                  // it. The click still lands.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => activate(result)}
                  className={`cursor-pointer px-3 py-2 ${
                    index === active ? "bg-muted" : ""
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-card-foreground">
                      {result.title}
                    </span>
                    <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {SEARCH_ENTITY_LABELS[result.entity]}
                    </span>
                  </span>
                  {result.subtitle ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {result.subtitle}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
