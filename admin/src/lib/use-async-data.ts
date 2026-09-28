"use client";

import { useCallback, useEffect, useState } from "react";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface AsyncDataResult<T> extends AsyncState<T> {
  refetch: () => void;
}

/**
 * `key` re-runs the fetcher when it changes, without spreading a variable
 * length array into the dependency list. Use it when the fetcher closes over
 * something that resolves late, such as the session user id.
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  key: string | number = 0,
): AsyncDataResult<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  // Captured once: the fetcher is a stable inline arrow in every caller, and
  // `key` is what re-runs it. Reading .current during render is also a lint
  // error under the React compiler rules.
  const [runner] = useState(() => ({ current: fetcher }));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        const data = await runner.current();
        if (active) setState({ data, loading: false, error: null });
      } catch (err) {
        if (active) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load data.",
          });
        }
      }
    }

    run();
    return () => {
      active = false;
    };
  }, [key, tick, runner]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { ...state, refetch };
}
