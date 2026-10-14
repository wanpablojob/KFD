/**
 * What the landing page's sign-in menu offers, by who is looking.
 *
 * The menu is a convenience, not the permission: AuthGate and MerchantGate
 * re-check the role on every portal page, roleTargetPath() refuses a login
 * target outside the role's own area, and RLS enforces it again in the
 * database. This only keeps the menu from offering a door that would bounce.
 *
 *   signed out          -> the three sign-in choices (routing happens after login)
 *   checking the role   -> the public tracker only, so no portal flashes up
 *   admin               -> Admin Console, Merchant Portal (admins may enter), tracker
 *   merchant            -> Merchant Portal, tracker
 *   any other account   -> tracker (customers and riders use the mobile app)
 */

export type PortalKey = "admin" | "merchant" | "customer";

export interface PortalLink {
  key: PortalKey;
  label: string;
  blurb: string;
  href: string;
}

export interface PortalSession {
  signedIn: boolean;
  /** True while a signed-in user's role is still being looked up. */
  roleLoading: boolean;
  isAdmin: boolean;
  isMerchant: boolean;
}

export interface PortalMenu {
  /** "sign-in": links go through /login. "open": the user is in, links go straight to the portal. */
  mode: "sign-in" | "open";
  portals: PortalLink[];
}

const TRACK: PortalLink = {
  key: "customer",
  label: "Track an Order",
  blurb: "Follow a delivery live",
  href: "/track",
};

export function portalMenu(session: PortalSession): PortalMenu {
  if (!session.signedIn) {
    return {
      mode: "sign-in",
      portals: [
        {
          key: "admin",
          label: "Admin Console",
          blurb: "Full operations dashboard",
          href: "/login?next=%2Fdashboard",
        },
        {
          key: "merchant",
          label: "Merchant Portal",
          blurb: "Menus, orders, revenue",
          href: "/login?next=%2Fmerchant",
        },
        TRACK,
      ],
    };
  }

  const portals: PortalLink[] = [];
  if (!session.roleLoading && session.isAdmin) {
    portals.push({
      key: "admin",
      label: "Admin Console",
      blurb: "Full operations dashboard",
      href: "/dashboard",
    });
  }
  if (!session.roleLoading && (session.isAdmin || session.isMerchant)) {
    portals.push({
      key: "merchant",
      label: "Merchant Portal",
      blurb: "Menus, orders, revenue",
      href: "/merchant",
    });
  }
  portals.push(TRACK);
  return { mode: "open", portals };
}
