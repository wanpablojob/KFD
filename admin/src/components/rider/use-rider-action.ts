"use client";

import { useCallback, useState } from "react";

/**
 * One write at a time, with the error kept where the admin can see it.
 *
 * The rider surfaces called `setRiderStatus` / `setRiderArchived` straight from
 * an async onChange. A rejected write was an unhandled promise rejection: no
 * message, no re-enabled control, and the row silently stayed on the old value
 * while the page claimed otherwise. `run` catches, and the caller renders
 * `error` into its existing role="alert" element.
 *
 * `pendingKey` rather than a boolean because the riders list has one status
 * control per row. Keying by row means saving Ana's status dims Ana's select
 * and leaves everyone else's usable, instead of freezing the whole table behind
 * one invisible write.
 */
export function useRiderAction() {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(
      key: string,
      fn: () => Promise<T>,
      options: { rethrow?: boolean } = {},
    ): Promise<T | undefined> => {
      // A second tap on a control that is only visually disabled still lands
      // here. Dropping it is what makes the disable actually mean something.
      if (pendingKey !== null) return undefined;
      setPendingKey(key);
      setError(null);
      try {
        return await fn();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Could not save. Try again.",
        );
        // Re-thrown only where a caller needs to keep its own dialog open.
        if (options.rethrow) throw cause;
        return undefined;
      } finally {
        setPendingKey(null);
      }
    },
    [pendingKey],
  );

  const isPending = useCallback(
    (key: string) => pendingKey === key,
    [pendingKey],
  );

  const clearError = useCallback(() => setError(null), []);

  return { pendingKey, error, run, isPending, clearError };
}