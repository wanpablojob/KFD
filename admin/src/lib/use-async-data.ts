"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
 * something that changes, such as a date range or the session user id; the
 * freshest closure is the one that runs.
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

  // The fetcher is re-created on every render -- it is an inline arrow that
  // closes over the caller's state -- and `key` is the caller's promise that
  // "the inputs changed, run it again". Holding the fetcher in state captured
  // the FIRST render's closure forever: a page that refetched a filtered query
  // under a new key ran the old closure and returned the old rows, so a date
  // range or a search that drove the query looked like it did nothing.
  //
  // Keep the latest fetcher in a ref instead, synced in its own effect. The
  // sync effect is declared before the fetch effect, so in the commit where
  // `key` changes the ref already points at this render's closure. Writing the
  // ref in an effect rather than during render keeps the React compiler rules
  // happy.
  const runner = useRef(fetcher);
  useEffect(() => {
    runner.current = fetcher;
  });
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
  }, [key, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { ...state, refetch };
}
