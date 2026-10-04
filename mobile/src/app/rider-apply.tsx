import { RiderApplyScreen } from "../screens/rider-apply-screen";

/**
 * Rider application route. Declared outside the rider tab navigator because an
 * applicant is not a rider yet: it is reachable from the account area, and
 * submit_rider_application() refuses anyone who already is one. The screen
 * reads the applicant's own application server-side, so this wrapper only needs
 * to hand it a renderer.
 */
export default function RiderApplyRoute() {
  return <RiderApplyScreen />;
}
