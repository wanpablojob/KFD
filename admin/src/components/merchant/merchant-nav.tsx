"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { signOut, useSessionUser } from "@/lib/auth";
import { useUserRole } from "@/lib/use-user-role";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboardIcon,
  ReceiptIcon,
  UtensilsIcon,
  LogOutIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Merchant navigation. Deliberately a different shape from the admin
 * sidebar: a top bar with horizontal tabs, because a merchant has two
 * jobs (orders, menu) and does not need a persistent 15-item rail.
 */
const TABS = [
  { href: "/merchant", label: "Today", icon: LayoutDashboardIcon },
  { href: "/merchant/orders", label: "Orders", icon: ReceiptIcon },
  { href: "/merchant/menu", label: "Menu", icon: UtensilsIcon },
];

export function MerchantNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useSessionUser();
  const { restaurantName } = useUserRole();
  const [busy, setBusy] = useState(false);

  const isActive = (href: string) =>
    href === "/merchant"
      ? pathname === "/merchant"
      : pathname.startsWith(href);

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
    } catch {
      // A failed sign-out must still send the user away; the AuthGate on the
      // next page will resolve the real session state.
    }
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground"
          >
            KFD
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {restaurantName ?? "Merchant"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user?.email ?? ""}
            </p>
          </div>
        </div>

        <nav className="ml-auto hidden items-center gap-1 sm:flex" aria-label="Merchant">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive(tab.href) ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive(tab.href)
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            disabled={busy}
            aria-label="Sign out"
          >
            <LogOutIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>

      <nav
        className="flex items-center gap-1 overflow-x-auto border-t border-border px-2 sm:hidden"
        aria-label="Merchant"
      >
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive(tab.href) ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors",
              isActive(tab.href)
                ? "border-b-2 border-primary text-primary"
                : "border-b-2 border-transparent text-muted-foreground",
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
