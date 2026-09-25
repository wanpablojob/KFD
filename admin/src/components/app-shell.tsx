"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { NotificationBell } from "./notification-bell";
import { fetchOrders } from "@/lib/supabase/queries";
import { useAsyncData } from "@/lib/use-async-data";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: orders } = useAsyncData(() => fetchOrders());

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-h-screen flex-col lg:pl-60">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          bell={<NotificationBell orders={orders ?? []} />}
        />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}