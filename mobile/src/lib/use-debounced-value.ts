import { useEffect, useState } from "react";

/**
 * Debounces a rapidly-changing value, returning the last value that stayed put
 * for `delayMs`.
 *
 * The storefront search box used to write this as a bare
 * `useCallback(() => { setTimeout(...) }, [query])`. useCallback only *creates*
 * a function -- nothing ever called it -- so the timer was never scheduled and
 * `debouncedQuery` stayed at its initial "". Every keystroke did nothing, which
 * the customer read as a dead search box.
 *
 * This is the real thing: an effect that schedules the write once the value has
 * stopped changing, clearing the pending timer on every change and on unmount so
 * a burst of keystrokes coalesces into one update.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
