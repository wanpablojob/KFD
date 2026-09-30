import { useSession } from "../../lib/session-context";
import { RiderHomeScreen } from "../../screens/rider-home-screen";

/**
 * Deliveries tab. Guarded in the root layout (role === "rider"); the context is
 * the single source of the resolved session, so the user id is read here rather
 * than refetched.
 */
export default function RiderIndexRoute() {
  const { user } = useSession();
  return <RiderHomeScreen userId={user?.id ?? ""} />;
}
