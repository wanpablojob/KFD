import { router } from "expo-router";
import { LandingScreen } from "../screens/landing-screen";

/** Signed-out landing route. Each action opens its own screen. */
export default function LandingRoute() {
  return (
    <LandingScreen
      onAction={(action) =>
        router.push(
          action === "signup" ? "/signup" : action === "track" ? "/track" : "/login"
        )
      }
    />
  );
}
