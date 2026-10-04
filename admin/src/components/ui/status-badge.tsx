import { Badge, type BadgeVariant } from "./badge";
import type { OrderStatus, RestaurantStatus, RiderStatus } from "@/lib/types";
import type { RiderApplicationStatus } from "@/lib/supabase/queries";

type Status =
  OrderStatus | RestaurantStatus | RiderStatus | RiderApplicationStatus;

const statusMap: Record<Status, { variant: BadgeVariant; label: string }> = {
  pending: { variant: "warning", label: "Pending" },
  confirmed: { variant: "info", label: "Confirmed" },
  preparing: { variant: "primary", label: "Preparing" },
  out_for_delivery: { variant: "info", label: "Out for delivery" },
  delivered: { variant: "success", label: "Delivered" },
  cancelled: { variant: "destructive", label: "Cancelled" },
  active: { variant: "success", label: "Active" },
  approval: { variant: "warning", label: "Approval" },
  suspended: { variant: "destructive", label: "Suspended" },
  online: { variant: "success", label: "Online" },
  busy: { variant: "warning", label: "Busy" },
  offline: { variant: "neutral", label: "Offline" },
  // Application states, which are distinct from rider_status: a pending
  // applicant is not an offline rider, they are not a rider at all yet.
  approved: { variant: "success", label: "Approved" },
  rejected: { variant: "destructive", label: "Rejected" },
};

export function StatusBadge({ status }: { status: Status }) {
  const entry = statusMap[status];
  if (!entry) {
    return <Badge>{status.replace(/_/g, " ")}</Badge>;
  }
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}
