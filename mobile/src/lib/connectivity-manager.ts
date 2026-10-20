import type { AppStateStatus } from "react-native";

/**
 * The two bridges React Query needs to hear about a device.
 *
 * Its defaults are browser events: `window` focus and `navigator.onLine`. In
 * React Native there is no `window` focus event, and `navigator.onLine` is
 * undefined, so the manager reports "online" forever and `refetchOnReconnect`
 * never fires. Both were already fixed once in `queryClient.tsx`; they live
 * here, as plain functions over an injected source, so a regression is a failing
 * test rather than something only a phone in a lift can see.
 *
 * The types are structural on purpose: tests pass a fake, the app passes
 * React Native's real modules.
 */

export interface NetInfoLike {
  addEventListener(
    listener: (state: { isConnected: boolean | null }) => void
  ): () => void;
}

export function onlineFromNetInfo(netInfo: NetInfoLike) {
  return (setOnline: (online: boolean) => void) => {
    // `isInternetReachable` is deliberately not consulted: on a captive portal
    // it is null or false while Supabase is perfectly reachable, and treating
    // that as offline would pause polling on a working phone. `isConnected`
    // false is the only unambiguous signal.
    return netInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false);
    });
  };
}

export interface AppStateLike {
  addEventListener(
    type: "change",
    listener: (state: AppStateStatus) => void
  ): { remove(): void };
}

export function focusFromAppState(appState: AppStateLike) {
  return (handleFocus: (focused: boolean) => void) => {
    const subscription = appState.addEventListener("change", (state) => {
      handleFocus(state === "active");
    });
    return () => subscription.remove();
  };
}
