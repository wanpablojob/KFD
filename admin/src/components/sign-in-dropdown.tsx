"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { PixelCrate, PixelBowl } from "@/components/pixel/sprites-render";

gsap.registerPlugin(useGSAP);

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
  const menuRef = useRef<HTMLDivElement>(null);
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

  useGSAP(
    () => {
      if (!open || !menuRef.current) return;
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) return;

      gsap.fromTo(
        menuRef.current,
        { autoAlpha: 0, y: -8 },
        { autoAlpha: 1, y: 0, duration: 0.22, ease: "power3.out" },
      );
      gsap.fromTo(
        "[data-dropdown-item]",
        { x: -10, autoAlpha: 0 },
        { x: 0, autoAlpha: 1, duration: 0.24, stagger: 0.05, ease: "power2.out" },
      );
    },
    { dependencies: [open], scope },
  );

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
        className="pixel-btn pixel-btn-primary pixel-focus"
      >
        <span className="hidden sm:inline">Sign in as</span>
        <span className="sm:hidden">Sign in</span>
        <span className="hidden sm:inline">: {current.label}</span>
        <span aria-hidden="true" className="text-xs">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Choose a portal"
          className="pixel-card absolute right-0 z-50 mt-3 w-72 p-2"
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
              className="pixel-focus flex items-center gap-3 px-3 py-3 no-underline transition-colors hover:bg-muted"
              style={{ color: "var(--foreground)" }}
            >
              <span className="shrink-0">
                {portal.key === "customer" ? (
                  <PixelCrate title="" />
                ) : (
                  <PixelBowl title="" />
                )}
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-bold">{portal.label}</span>
                <span className="pixel-body text-xs">{portal.blurb}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
