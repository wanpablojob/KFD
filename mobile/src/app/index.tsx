import { router } from "expo-router";
import { LandingScreen } from "../screens/landing-screen";
import { setPendingIntent } from "../lib/pending-intent";

/** Signed-out landing route. Each action opens its own screen. */
export default function LandingRoute() {
  return (
    <LandingScreen
      onAction={(action) => {
        // A rider needs an account first: sign up (or sign in), then the
        // customer section opens the application (pending-intent.ts).
        if (action === "ride") setPendingIntent("rider-apply");
        router.push(
          action === "signup" || action === "ride"
            ? "/signup"
            : action === "track"
              ? "/track"
              : "/login"
        );
      }}
    />
  );
}
