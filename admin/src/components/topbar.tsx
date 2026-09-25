"use client";

import { useRouter } from "next/navigation";
import { SearchIcon, LogOutIcon, MapPinIcon, XIcon } from "./ui/icons";
import { ThemeToggle } from "./theme-toggle";
import { initials } from "@/lib/format";
import { signOut, useSessionUser } from "@/lib/auth";
import { useGlobalSearch, setGlobalSearch } from "@/lib/global-search";

export function Topbar({
  onMenuClick,
  bell,
}: {
  onMenuClick: () => void;
  bell?: React.ReactNode;
}) {
  const router = useRouter();
  const { user } = useSessionUser();
  const globalQuery = useGlobalSearch();
  const displayName =
    user?.user_metadata?.name ?? user?.email ?? "Admin";
  const avatarInitials = initials(displayName) || "AD";

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      // Session may already be gone; the redirect below still must happen.
    }
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-card/80 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
        aria-label="Open navigation"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="relative hidden max-w-md flex-1 sm:block">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={globalQuery}
          onChange={(e) => setGlobalSearch(e.target.value)}
          placeholder="Search orders, restaurants, riders…"
          className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/25"
        />
        {globalQuery ? (
          <button
            type="button"
            onClick={() => setGlobalSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear search"
          >
            <XIcon className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground md:inline-flex">
          <MapPinIcon className="h-3.5 w-3.5 text-primary" />
          Kabankalan City Proper
        </span>

        <ThemeToggle />

        {bell}

        <div className="flex items-center gap-2.5 border-l border-border pl-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {avatarInitials}
          </span>
          <span className="hidden text-sm sm:block">
            <span className="block font-medium leading-tight text-foreground">
              {displayName}
            </span>
            <span className="block text-xs text-muted-foreground">
              {user?.user_metadata?.role ?? "Super admin"}
            </span>
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOutIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}