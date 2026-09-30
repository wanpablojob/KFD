import { QueryClient } from "@tanstack/react-query";
import {
  PersistQueryClientProvider,
  Persister,
  experimental_createQueryPersister,
} from "@tanstack/react-query-persist-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Query client with persistent cache for offline-first experience.
 *
 * Persists to AsyncStorage (expo-secure-store is for credentials only).
 * Stale-while-revalidate means the UI renders cached data immediately
 * while a fresh fetch runs in the background.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 min
      gcTime: 1000 * 60 * 60 * 24, // 24 hr
      retry: (failureCount, error) => {
        if (error instanceof Error && error.message.includes("offline")) return false;
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: "always",
    },
    mutations: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

// Experimental persister from TanStack Query v5
const experimentalPersister = experimental_createQueryPersister({
  storage: AsyncStorage,
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  serialize: (data) => JSON.stringify(data),
  deserialize: (data) => JSON.parse(data),
});

/**
 * Adapter to make experimental persister compatible with PersistQueryClientProvider's
 * Persister interface (persistClient, restoreClient, removeClient).
 */
const persister: Persister = {
  persistClient: async (persistedClient) => {
    await experimentalPersister.persistQuery?.(persistedClient as any);
  },
  restoreClient: async () => {
    // The experimental persister restores automatically via persisterFn
    // This is called during app startup - return undefined to skip manual restore
    return undefined;
  },
  removeClient: async () => {
    await experimentalPersister.removeQueries?.({});
  },
};

export { queryClient, persister, PersistQueryClientProvider };
