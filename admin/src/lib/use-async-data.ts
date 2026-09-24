"use client";

import { useEffect, useState } from "react";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useAsyncData<T>(fetcher: () => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  const [runner] = useState(() => ({ current: fetcher }));

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
  }, [runner]);

  return state;
}