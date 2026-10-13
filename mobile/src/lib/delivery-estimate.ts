/**
 * When an order should arrive, as an honest window rather than a fake-precise
 * minute: placed time + the restaurant's prep time (snapshotted on the order)
 * + a travel range across Kabankalan. Null once the order is finished.
 */

/** Rider time from kitchen to door, in minutes. */
export const TRAVEL_MINUTES = { min: 15, max: 30 } as const;
/** Used for orders placed before prep time was recorded (0077). */
export const DEFAULT_PREP_MINUTES = 20;

const FINISHED = new Set(["delivered", "cancelled"]);

export function deliveryWindow(
  placedAt: string,
  prepMinutes: number | null,
  status: string
): { from: Date; to: Date } | null {
  if (FINISHED.has(status)) return null;
  const placed = new Date(placedAt).getTime();
  if (Number.isNaN(placed)) return null;
  const prep = prepMinutes ?? DEFAULT_PREP_MINUTES;
  const minute = 60_000;
  return {
    from: new Date(placed + (prep + TRAVEL_MINUTES.min) * minute),
    to: new Date(placed + (prep + TRAVEL_MINUTES.max) * minute),
  };
}

/** "12:40–12:55" in the device's locale. */
export function formatWindow(window: { from: Date; to: Date }): string {
  const t = (d: Date) =>
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${t(window.from)}–${t(window.to)}`;
}
