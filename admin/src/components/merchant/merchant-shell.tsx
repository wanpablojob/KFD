"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSessionUser } from "@/lib/auth";
import { useUserRole } from "@/lib/use-user-role";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  ReceiptIcon,
  UtensilsIcon,
  XIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/merchant", label: "Today", icon: LayoutDashboardIcon },
  { href: "/merchant/orders", label: "Orders", icon: ReceiptIcon },
  { href: "/merchant/menu", label: "Menu", icon: UtensilsIcon },
] as const;

/**
 * Merchant portal chrome: a left rail on desktop and a drawer on mobile, the
 * same skeleton as the admin console so the two portals behave like one
 * application. Three pages is a small rail, but the operator who runs a
 * restaurant also has an admin role on the platform, and porting between two
 * differently-shaped navs on a shift costs more than the rail's width.
 */
export function MerchantShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useSessionUser();
  const { restaurantName } = useUserRole();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
    } catch {
      // A failed sign-out must still send the user away; the AuthGate on the
      // next page resolves the real session state.
    }
    router.replace("/login");
  }

  const title = restaurantName ?? "Merchant";
  const displayName = user?.user_metadata?.name ?? user?.email ?? "Merchant";

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-30 bg-zinc-900/40 backdrop-blur-sm lg:hidden",
          open ? "block" : "hidden",
        )}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-card text-card-foreground shadow-lg lg:shadow-none",
          "transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <Link
            href="/merchant"
            onClick={() => setOpen(false)}
            className="flex min-w-0 items-center gap-2.5"
          >
            <Image
              src="/images/kabankalan/logo.jpg"
              alt="Kabankalan Food Delivery"
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 rounded-lg object-contain"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold tracking-tight text-card-foreground">
                {title}
              </span>
              <span className="block text-xs text-muted-foreground">
                KFD merchant
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            aria-label="Close navigation"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Merchant">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/merchant"
                ? pathname === "/merchant"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border px-5 py-4">
          <p className="text-sm font-medium text-card-foreground">
            Kabankalan City Proper
          </p>
          <p className="text-xs text-muted-foreground">
            Negros Occidental · Live
          </p>
        </div>

        <div className="flex items-center gap-3 border-t border-border px-5 py-3">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-card-foreground">
              {displayName}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {user?.email ?? ""}
            </span>
          </span>
        </div>

        <div className="border-t border-border px-3 py-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleSignOut}
            disabled={busy}
            aria-label="Sign out"
          >
            <LogOutIcon className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Open navigation"
            aria-expanded={open}
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">
              {title}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {user?.email ?? ""}
            </div>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </>
  );
}