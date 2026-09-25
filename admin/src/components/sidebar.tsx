"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  BikeIcon,
  LayoutDashboardIcon,
  ReceiptIcon,
  StoreIcon,
  UsersIcon,
  UtensilsIcon,
  XIcon,
} from "./ui/icons";
import { cn } from "@/lib/utils";
import { useSessionUser } from "@/lib/auth";

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/orders", label: "Orders", icon: ReceiptIcon },
  { href: "/restaurants", label: "Restaurants", icon: StoreIcon },
  { href: "/riders", label: "Riders", icon: BikeIcon },
  { href: "/customers", label: "Customers", icon: UsersIcon },
  { href: "/menu", label: "Menu Items", icon: UtensilsIcon },
] as const;

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { user } = useSessionUser();
  const displayName =
    user?.user_metadata?.name ?? user?.email ?? "Admin";

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-30 bg-zinc-900/40 backdrop-blur-sm lg:hidden",
          open ? "block" : "hidden",
        )}
        onClick={onClose}
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
          <Link href="/" onClick={onClose} className="flex items-center gap-2.5">
            <Image
              src="/images/kabankalan/logo.jpg"
              alt="Kabankalan Food Delivery"
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg object-contain"
            />
            <span className="text-lg font-bold tracking-tight text-card-foreground">
              KFD Admin
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            aria-label="Close navigation"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
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
            <span className="block text-xs text-muted-foreground">
              {user?.user_metadata?.role ?? "Super admin"}
            </span>
          </span>
        </div>
      </aside>
    </>
  );
}