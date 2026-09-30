import { router } from "expo-router";
import { LandingScreen } from "../screens/landing-screen";

/**
 * Signed-out landing route. LandingAction only ever means "go sign in".
 */
export default function LandingRoute() {
  return <LandingScreen onAction={() => router.push("/login")} />;
}
