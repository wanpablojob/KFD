"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { NotificationBell } from "./notification-bell";
import { GlobalSearchSeed } from "./global-search-seed";
import { fetchOrders } from "@/lib/supabase/queries";
import { useAsyncData } from "@/lib/use-async-data";
import { useUserRole } from "@/lib/use-user-role";
import type { AppRole } from "@/lib/role";

/** AppRole includes null, which cannot key a Record, hence NonNullable. */
const ROLE_LABELS: Record<NonNullable<AppRole>, string> = {
  admin: "Administrator",
  merchant: "Merchant",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: orders } = useAsyncData(() => fetchOrders());

  // The role is resolved here, once, and passed down. useAsyncData has no
  // cache, so calling useUserRole() in both Sidebar and Topbar would fire two
  // identical fetchUserRole requests on every page load.
  const { role, loading: roleLoading } = useUserRole();

  // `user_metadata` is writable by the user through auth.updateUser(), so it
  // is not an authority and can never label a role. app_users is. An
  // unresolved role maps to a neutral label: the old `?? "Super admin"`
  // fallback labelled every user without metadata role -- including a brand
  // new merchant -- as a super admin. Empty string while loading keeps the
  // slot from flashing one label then another.
  const roleLabel = roleLoading ? "" : role ? ROLE_LABELS[role] : "Signed in";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Makes ?q= in a search result URL filter the page it lands on. */}
      <GlobalSearchSeed />
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        roleLabel={roleLabel}
      />
      <div className="flex min-h-screen flex-col lg:pl-60">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          bell={<NotificationBell orders={orders ?? []} />}
          roleLabel={roleLabel}
        />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}