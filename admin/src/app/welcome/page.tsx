import { LandingScene } from "@/components/landing-scene";
import "./pixel.css";

export const metadata = {
  title: "KFD — Kabankalan Food Delivery",
  description:
    "Kabankalan's food delivery platform: restaurants, riders and customers in one system. Menus, orders and dispatch priced and routed on the server.",
};

/**
 * Public marketing page.
 *
 * Deliberately NOT at `/`: the dashboard owns that route through the
 * (dashboard) route group, and moving it would change every internal link, the
 * role-routing `next` targets and the auth redirect in one go. `/welcome` keeps
 * all of that untouched. The dashboard's own login page links here, so the
 * landing page is reachable without typing the path.
 */
export default function WelcomePage() {
  return <LandingScene />;
}
