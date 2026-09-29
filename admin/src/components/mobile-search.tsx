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
const MIN_TERM_LENGTH = 2;

/**
 * Mobile search overlay. Shares query state with the desktop GlobalSearch via
 * useGlobalSearch/setGlobalSearch, but owns its own overlay/popover state.
 * Opens from a trigger button in the topbar on small screens.
 */
interface MobileSearchProps {
  /** Called when the overlay should close (e.g. trigger button focus return). */
  onClose?: () => void;
}

export function MobileSearch({ onClose }: MobileSearchProps) {
  const router = useRouter();
  const query = useGlobalSearch();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [settled, setSettled] = useState<{
    term: string;
    results: SearchResult[];
    error: string | null;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const listId = useId();
  const statusId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  const term = query.trim();
  const isCurrent = settled?.term === term;
  const results = isCurrent ? settled.results : [];
  const error = isCurrent ? settled.error : null;
  const searchable = term.length >= MIN_TERM_LENGTH;
  const popoverOpen = open && searchable;

  // Debounced search effect
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
      } catch (cause) {
        if (stale) return;
        setSettled({
          term,
          results: [],
          error: cause instanceof Error ? cause.message : "Search is unavailable.",
        });
      } finally {
        if (!stale) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [searchable, term]);

  // Dismiss on outside click
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

  // Focus management: trap focus in overlay, return to trigger on close
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Prevent body scroll while overlay is open
      document.body.style.overflow = "hidden";
      // Focus the input after overlay renders
      setTimeout(() => {
        const input = containerRef.current?.querySelector("input");
        (input as HTMLElement)?.focus();
      }, 0);
    } else {
      document.body.style.overflow = "";
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
      onClose?.();
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Keyboard handlers
  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
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

  function activate(result: SearchResult) {
    setOpen(false);
    setGlobalSearch("");
    router.push(result.href);
  }

  return (
    <>
      {/* Mobile trigger button — only visible below sm breakpoint */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
        aria-label="Open search"
        aria-expanded={open}
        aria-controls={open ? "mobile-search-overlay" : undefined}
      >
        <SearchIcon className="h-5 w-5" />
      </button>

      {/* Full-screen overlay on mobile */}
      {open && (
        <div
          ref={containerRef}
          id="mobile-search-overlay"
          className="fixed inset-0 z-50 flex flex-col bg-background sm:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Search"
        >
          {/* Overlay header with close button */}
          <header className="flex h-16 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sticky top-0 z-10">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close search"
            >
              <XIcon className="h-5 w-5" />
            </button>
            <div className="flex-1 min-w-0">
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
                autoFocus
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
            </div>
          </header>

          {/* Live region for search status */}
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

          {/* Results popover */}
          {popoverOpen && (
            <div className="flex-1 overflow-y-auto px-4 pb-4">
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
                  className="max-h-[calc(100vh-200px)] overflow-y-auto py-1"
                >
                  {results.map((result, index) => (
                    <li
                      key={`${result.entity}-${result.id}`}
                      id={optionId(index)}
                      role="option"
                      aria-selected={index === active}
                      data-entity={result.entity}
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
          )}
        </div>
      )}
    </>
  );
}

