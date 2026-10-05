/**
 * Rider availability, in the words a rider would use.
 *
 * The wire value is the enum ("online"), and the Profile tab used to render it
 * verbatim: three buttons reading "online / busy / offline" in lowercase. Beyond
 * looking like a debug build, that said nothing about consequences -- the one
 * thing a rider needs to know is that dispatch only offers work to riders whose
 * status is `online` (admin_dispatch_order filters on `status = 'online'`), so
 * "offline" silently costs them money.
 */

export const RIDER_STATUSES = ["online", "busy", "offline"] as const;

export type RiderStatus = (typeof RIDER_STATUSES)[number];

export interface RiderStatusMeta {
  label: string;
  /** What the server does with this value, in one sentence. */
  description: string;
}

export const RIDER_STATUS_META: Record<RiderStatus, RiderStatusMeta> = {
  online: {
    label: "Online",
    description: "You'll be offered new deliveries",
  },
  busy: {
    label: "Busy",
    description: "On a delivery. Not offered new work",
  },
  offline: {
    label: "Offline",
    description: "Not taking work. You'll miss offers",
  },
};

export function riderStatusMeta(status: string): RiderStatusMeta {
  if ((RIDER_STATUSES as readonly string[]).includes(status)) {
    return RIDER_STATUS_META[status as RiderStatus];
  }
  // An unknown enum value is shown as itself rather than defaulted to "online",
  // which would be the one status that changes what dispatch does.
  return { label: status, description: "Unknown status" };
}
