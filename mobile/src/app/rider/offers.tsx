import { RiderOffersScreen } from "../../screens/rider-offers-screen";
import { useSession } from "../../lib/session-context";

/**
 * Available deliveries tab. Route wrapper only, so the screen itself stays
 * testable and free of expo-router.
 */
export default function RiderOffersRoute() {
  const { user } = useSession();
  return <RiderOffersScreen userId={user?.id ?? ""} />;
}
