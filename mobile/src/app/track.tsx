import { router, useLocalSearchParams } from "expo-router";
import { useSession } from "../lib/session-context";
import { TrackOrderScreen } from "../screens/track-order-screen";

/**
 * Public order tracking. `?ref=` (from a deep link like kfd://track?ref=… or a
 * push tap carrying data.reference) prefills and auto-tracks it.
 */
const HOME: Record<string, "/customer" | "/rider" | "/merchant" | "/account"> = {
  customer: "/customer",
  rider: "/rider",
  merchant: "/merchant",
  admin: "/account",
};

export default function TrackRoute() {
  const { ref } = useLocalSearchParams<{ ref?: string }>();
  const { role } = useSession();
  return (
    <TrackOrderScreen
      onBack={() => {
        // Deep links and push taps can open /track with no history to unwind.
        // Each role goes to its own home: "/" is a signed-out screen, and a
        // signed-in rider sent there was left stuck on this page.
        if (router.canGoBack()) router.back();
        else router.replace(HOME[role?.role ?? ""] ?? "/");
      }}
      initialReference={typeof ref === "string" ? ref : undefined}
      onRate={
        role?.role === "customer"
          ? (reference) =>
              router.push({ pathname: "/customer/orders", params: { rate: reference } })
          : undefined
      }
    />
  );
}
