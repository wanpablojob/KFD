/**
 * The fields an admin may edit about a rider.
 *
 * A short list on purpose. The riders row also holds deliveries, rating,
 * earnings, archived_at and suspended_at, and every one of those is maintained
 * by the database rather than by a person in a form:
 *
 *   - deliveries / earnings are incremented by rider_mark_delivered in the same
 *     statement that writes the payout ledger row (0038),
 *   - rating is a seeded value nothing currently feeds,
 *   - archived_at / suspended_at have dedicated RPCs (0010, 0050) that also
 *     write the audit row,
 *   - status is the dispatch availability toggle, with its own control and its
 *     own audit trigger.
 *
 * The form used to build a full upsert from the row it had loaded, which meant
 * an admin who opened a rider, waited while two deliveries completed, and then
 * corrected a phone number wrote the older counters back -- a lost update on the
 * earnings column. Building the patch from a fixed key list makes that
 * unrepresentable rather than merely discouraged.
 */

export interface RiderProfileInput {
  name: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  vehicle: string;
}

/** The exact columns an edit may touch. Nothing else is in the object. */
export interface RiderProfilePatch {
  name: string;
  email: string;
  phone: string;
  city: string;
  vehicle: string;
}

export const DEFAULT_RIDER_CITY = "Kabankalan City Proper";

export function riderProfilePatch(input: RiderProfileInput): RiderProfilePatch {
  return {
    name: (input.name ?? "").trim(),
    email: (input.email ?? "").trim(),
    // Empty string rather than null: the column is nullable, so sending null
    // would skip the update and leave an emptied field looking like it failed
    // to save.
    phone: (input.phone ?? "").trim(),
    city: (input.city ?? "").trim() || DEFAULT_RIDER_CITY,
    vehicle: input.vehicle,
  };
}