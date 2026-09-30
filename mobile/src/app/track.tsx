import { router, useLocalSearchParams } from "expo-router";
import { TrackOrderScreen } from "../screens/track-order-screen";

/**
 * Public order tracking. `?ref=` (from a deep link like kfd://track?ref=… or a
 * push tap carrying data.reference) prefills and auto-tracks it.
 */
export default function TrackRoute() {
  const { ref } = useLocalSearchParams<{ ref?: string }>();
  return (
    <TrackOrderScreen
      onBack={() => {
        // Deep links can open /track with no history to unwind. Fall back to
        // the anchor, which the router rewrites to the first available screen
        // for the current session (landing when signed out, the storefront when
        // signed in).
        if (router.canGoBack()) router.back();
        else router.replace("/");
      }}
      initialReference={typeof ref === "string" ? ref : undefined}
    />
  );
}
