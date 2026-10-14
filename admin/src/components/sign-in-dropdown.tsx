"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboardIcon,
  LogOutIcon,
  ReceiptIcon,
  StoreIcon,
} from "@/components/ui/icons";
import { secondaryButton } from "@/components/marketing/styles";
import { signOut, useSessionUser } from "@/lib/auth";
import { useUserRole } from "@/lib/use-user-role";
import { portalMenu, type PortalKey } from "@/lib/portal-menu";

const ITEM =
  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-foreground no-underline transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const ICONS: Record<PortalKey, typeof StoreIcon> = {
  admin: LayoutDashboardIcon,
  merchant: StoreIcon,
  customer: ReceiptIcon,
};

/**
 * The staff menu in the landing page header.
 *
 * Signed out it offers the three ways in; signed in it offers only the portals
 * that account's role may open, plus sign out. portalMenu() decides which; the
 * gates and the database still enforce access on every portal page, so this
 * never grants anything, it just does not offer a door that would bounce.
 */
export function SignInDropdown() {
  const { user, loading: authLoading } = useSessionUser();
  const { loading: roleLoading, isAdmin, isMerchant } = useUserRole();
  const menu = portalMenu({ signedIn: !!user, roleLoading, isAdmin, isMerchant });

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PortalKey>("admin");
  const [signingOut, setSigningOut] = useState(false);
  const scope = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click and on Escape. Without this a dropdown that opens on
  // hover/click traps keyboard users inside the page behind it.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (scope.current && !scope.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
      setOpen(false);
    }
  }

  const current = menu.portals.find((p) => p.key === selected) ?? menu.portals[0];
  const signedIn = menu.mode === "open";

  return (
    <div ref={scope} className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        data-active={open}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={authLoading}
        onClick={() => setOpen((v) => !v)}
        className={`${secondaryButton} px-4 py-2`}
      >
        {signedIn ? (
          <span>Open portal</span>
        ) : (
          <>
            <span className="hidden sm:inline">Sign in as: {current.label}</span>
            <span className="sm:hidden">Sign in</span>
          </>
        )}
        <span aria-hidden="true" className="text-xs">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={signedIn ? "Your portals" : "Choose a portal"}
          className="absolute right-0 z-50 mt-3 w-72 rounded-2xl border border-border bg-card p-2 shadow-lg"
        >
          {signedIn && user?.email ? (
            <p className="truncate px-3 pt-2 pb-1 text-xs text-muted-foreground">
              Signed in as {user.email}
            </p>
          ) : null}

          {menu.portals.map((portal) => {
            const Icon = ICONS[portal.key];
            return (
              <Link
                key={portal.key}
                href={portal.href}
                role="menuitem"
                data-dropdown-item=""
                onClick={() => {
                  setSelected(portal.key);
                  setOpen(false);
                }}
                className={ITEM}
              >
                <span className="shrink-0 text-primary" aria-hidden="true">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">{portal.label}</span>
                  <span className="text-xs text-muted-foreground">{portal.blurb}</span>
                </span>
              </Link>
            );
          })}

          {signedIn && roleLoading ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Checking your access…</p>
          ) : null}

          {signedIn ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className={`${ITEM} mt-1 border-t border-border pt-3`}
            >
              <span className="shrink-0 text-muted-foreground" aria-hidden="true">
                <LogOutIcon className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold">
                {signingOut ? "Signing out…" : "Sign out"}
              </span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
