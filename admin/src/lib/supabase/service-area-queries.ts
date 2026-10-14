import { supabase } from "./client";

/**
 * Barangays KFD delivers to (0077). While the list is empty the customer app
 * accepts any address; once it has rows, customer_place_order refuses orders
 * outside it. RLS lets anyone read and only admins write.
 */

export interface ServiceArea {
  barangay: string;
  created_at: string;
}

export async function fetchServiceAreas(): Promise<ServiceArea[]> {
  const { data, error } = await supabase
    .from("service_areas")
    .select("barangay, created_at")
    .order("barangay");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addServiceArea(barangay: string): Promise<void> {
  const { error } = await supabase.from("service_areas").insert({ barangay: barangay.trim() });
  if (error) {
    throw new Error(
      error.code === "23505" ? `${barangay.trim()} is already on the list.` : error.message
    );
  }
}

export async function removeServiceArea(barangay: string): Promise<void> {
  const { error } = await supabase.from("service_areas").delete().eq("barangay", barangay);
  if (error) throw new Error(error.message);
}
