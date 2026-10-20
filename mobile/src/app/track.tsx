import { router, useLocalSearchParams } from "expo-router";
import { useSession } from "../lib/session-context";
import { TrackOrderScreen } from "../screens/track-order-screen";

/**
 * Public order tracking. `?ref=` (from a deep link like kfd://track?ref=… or a
 * push tap carrying data.reference) prefills and auto-tracks it.
 */
export default function TrackRoute() {
  const { ref } = useLocalSearchParams<{ ref?: string }>();
  const { role } = useSession();
  return (
    <TrackOrderScreen
      onBack={() => {
        // Deep links and push taps can open /track with no history to unwind.
        // A customer then goes to their Home tab; anyone else to the anchor,
        // which the router rewrites to the first screen their session allows.
        if (router.canGoBack()) router.back();
        else router.replace(role?.role === "customer" ? "/customer" : "/");
      }}
      initialReference={typeof ref === "string" ? ref : undefined}
    />
  );
}
