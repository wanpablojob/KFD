import { QueryClient, focusManager, onlineManager } from "@tanstack/react-query";
import {
  PersistQueryClientProvider,
  Persister,
  experimental_createQueryPersister,
} from "@tanstack/react-query-persist-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";

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

// React Query's focusManager defaults to the web `window` focus event, which
// does not exist in React Native, so `refetchOnWindowFocus` never fires. Point
// it at AppState so screens that opt in (the rider offers queue) refetch when
// the app returns to the foreground. The query default stays
// `refetchOnWindowFocus: false`; only queries that ask for focus refetching are
// affected.
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener("change", (state) => {
    handleFocus(state === "active");
  });
  return () => subscription.remove();
});

// Same problem for onlineManager: it defaults to the browser's `navigator.onLine`,
// which is undefined in React Native, so it reports "online" forever and the
// `refetchOnReconnect: "always"` default above never fired. NetInfo is the only
// source of truth for connectivity on a device, and ConnectivityProvider already
// uses it for the offline banner -- this is the query-cache half of that signal.
//
// `isInternetReachable` is deliberately not consulted: on a captive-portal or
// captive-wifi network it is null or false while Supabase is perfectly
// reachable, and treating that as offline would pause polling on a working
// phone. isConnected false is the only unambiguous signal.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected !== false);
  })
);

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
