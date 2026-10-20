import { QueryClient, focusManager, onlineManager } from "@tanstack/react-query";
import {
  PersistQueryClientProvider,
  Persister,
  experimental_createQueryPersister,
} from "@tanstack/react-query-persist-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { focusFromAppState, onlineFromNetInfo } from "./connectivity-manager";

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

/**
 * Point React Query at the device's own events. Its defaults are browser events
 * (`window` focus, `navigator.onLine`) that do not exist in React Native, so
 * `refetchOnWindowFocus` and `refetchOnReconnect` silently never fired. The two
 * bridges and the reasoning behind them live in connectivity-manager.ts, where
 * a fake source can prove them in a test.
 *
 * The query default stays `refetchOnWindowFocus: false`; only queries that ask
 * for focus refetching (the rider offers queue) are affected.
 */
focusManager.setEventListener(focusFromAppState(AppState));
onlineManager.setEventListener(onlineFromNetInfo(NetInfo));

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
