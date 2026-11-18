import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { focusFromAppState, onlineFromNetInfo } from "./connectivity-manager";

/**
 * Query client. Cached data shows immediately while a fresh fetch runs in the
 * background (stale-while-revalidate), in memory.
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
    // A button's write is never retried by itself: three retries with backoff
    // held a failed tap for ~7 s before its error showed, and could send a
    // write (accept, give back, pay) twice. The person taps again if they want.
    mutations: {
      retry: 0,
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

// The cache used to be saved to AsyncStorage through an adapter whose restore
// returned nothing: the whole cache was serialised and written on every change
// (and polls change it every 10-20 s), on the JS thread, and never read back.
// It is gone; this clears what it left behind, once, in the background.
void AsyncStorage.getAllKeys()
  .then((keys) => keys.filter((k) => k.startsWith("tanstack-query")))
  .then((stale) => (stale.length ? AsyncStorage.multiRemove(stale) : undefined))
  .catch(() => undefined);

export { queryClient, QueryClientProvider };
