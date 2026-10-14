"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LayoutDashboardIcon, ReceiptIcon, StoreIcon } from "@/components/ui/icons";
import { secondaryButton } from "@/components/marketing/styles";

/**
 * The portals a visitor can enter, and where each one should land them.
 *
 * `next` is passed through to /login and resolved by roleTargetPath(), which
 * only honours a target inside the signed-in role's own area. That is the whole
 * reason this dropdown can be a plain link list without re-implementing any
 * access rule: the RBAC decision stays in one tested function.
 */
const PORTALS = [
  {
    key: "admin",
    label: "Admin Console",
    blurb: "Full operations dashboard",
    next: "/",
    href: "/login?next=%2F",
  },
  {
    key: "merchant",
    label: "Merchant Portal",
    blurb: "Menus, orders, revenue",
    next: "/merchant",
    href: "/login?next=%2Fmerchant",
  },
  {
    key: "customer",
    label: "Track an Order",
    blurb: "Follow a delivery live",
    next: "/track",
    href: "/track",
  },
] as const;

type PortalKey = (typeof PORTALS)[number]["key"];

export function SignInDropdown() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PortalKey>("admin");
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

  const current = PORTALS.find((p) => p.key === selected) ?? PORTALS[0];

  return (
    <div ref={scope} className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        data-active={open}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={secondaryButton}
      >
        <span className="hidden sm:inline">Sign in as: {current.label}</span>
        <span className="sm:hidden">Sign in</span>
        <span aria-hidden="true" className="text-xs">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Choose a portal"
          className="absolute right-0 z-50 mt-3 w-72 rounded-2xl border border-border bg-card p-2 shadow-lg"
        >
          {PORTALS.map((portal) => (
            <Link
              key={portal.key}
              href={portal.href}
              role="menuitem"
              data-dropdown-item=""
              onClick={() => {
                setSelected(portal.key);
                setOpen(false);
              }}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-foreground no-underline transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="shrink-0 text-primary" aria-hidden="true">
                {portal.key === "customer" ? (
                  <ReceiptIcon className="h-5 w-5" />
                ) : portal.key === "merchant" ? (
                  <StoreIcon className="h-5 w-5" />
                ) : (
                  <LayoutDashboardIcon className="h-5 w-5" />
                )}
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold">{portal.label}</span>
                <span className="text-xs text-muted-foreground">{portal.blurb}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
