import { supabase } from "./client";
import type { RiderApplyForm, VehicleType } from "@/lib/rider-apply";

/**
 * The signed-in visitor's own rider application (0046). Both RPCs are keyed to
 * auth.uid() server-side, so the website can only ever read or write the
 * caller's own row; the admin review queue is a different function.
 */

export interface MyApplication {
  id: string;
  status: "pending" | "approved" | "rejected";
  fullName: string;
  phone: string;
  city: string;
  vehicle: VehicleType;
  licenceRef: string | null;
  orcrRef: string | null;
  governmentIdRef: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export async function fetchMyApplication(): Promise<MyApplication | null> {
  const { data, error } = await supabase.rpc("my_rider_application");
  if (error) throw new Error(error.message);
  // RETURNS TABLE with limit 1: a zero- or one-element array.
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    fullName: row.full_name,
    phone: row.phone,
    city: row.city,
    vehicle: row.vehicle,
    licenceRef: row.licence_ref ?? null,
    orcrRef: row.orcr_ref ?? null,
    governmentIdRef: row.government_id_ref ?? null,
    decisionNote: row.decision_note ?? null,
    createdAt: row.created_at,
  };
}

/** Idempotent server-side: a retry returns the pending application, never a second one. */
export async function submitApplication(form: RiderApplyForm): Promise<void> {
  const optional = (value: string) => value.trim() || undefined;
  const { error } = await supabase.rpc("submit_rider_application", {
    p_full_name: form.fullName.trim(),
    p_phone: form.phone.trim(),
    p_city: optional(form.city),
    p_vehicle: form.vehicle,
    p_licence_ref: optional(form.licenceRef),
    p_orcr_ref: optional(form.orcrRef),
    p_government_id_ref: optional(form.governmentIdRef),
  });
  if (error) throw new Error(error.message);
}
