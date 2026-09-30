import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/app-shell";

export default function DashboardLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}