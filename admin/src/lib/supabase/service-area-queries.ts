import { supabase } from "./client";

/**
 * Barangays KFD delivers to (0077) and what delivery costs there (0080). While
 * the list is empty the customer app accepts any address at the flat fee; once
 * it has rows, customer_place_order refuses orders outside it. RLS lets anyone
 * read and only admins write.
 */

export interface ServiceArea {
  barangay: string;
  created_at: string;
  /** Null when the fee is agreed at the door. */
  delivery_fee: number | null;
  fee_agreed_in_person: boolean;
}

export async function fetchServiceAreas(): Promise<ServiceArea[]> {
  const { data, error } = await supabase
    .from("service_areas")
    .select("barangay, created_at, delivery_fee, fee_agreed_in_person")
    .order("barangay");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Add a barangay or change its fee. Goes through admin_set_service_area rather
 * than a table insert: a row with no fee and no agreed-at-the-door flag is
 * listed but refused at checkout, which a plain insert would create.
 */
export async function setServiceArea(
  barangay: string,
  fee: number | null,
  agreedInPerson: boolean
): Promise<void> {
  const { error } = await supabase.rpc("admin_set_service_area", {
    p_barangay: barangay.trim(),
    // Null is how the RPC spells "agreed at the door". The generated type says
    // number because the parameter has no default, but Postgres takes null.
    p_delivery_fee: (agreedInPerson ? null : fee) as unknown as number,
    p_fee_agreed_in_person: agreedInPerson,
  });
  if (error) throw new Error(error.message);
}

export async function removeServiceArea(barangay: string): Promise<void> {
  const { error } = await supabase.from("service_areas").delete().eq("barangay", barangay);
  if (error) throw new Error(error.message);
}
