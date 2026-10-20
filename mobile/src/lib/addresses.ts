/**
 * Saved delivery addresses, persisted per signed-in user.
 *
 * The checkout used to hold a single free-text address in component state: no
 * validation, nothing saved, and the customer retyped the same barangay on every
 * order. Storage is AsyncStorage (not SecureStore -- that is for the session
 * token, per lib/supabase.ts) and is scoped by user id so two accounts on one
 * device do not see each other's addresses.
 *
 * Validation lives in ./address-validation so it stays testable without the
 * native storage module.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { ADDRESS_LIMIT, addressLabelFor, normaliseAddress } from "./address-validation";

export { ADDRESS_LIMIT, validateAddress } from "./address-validation";

export interface SavedAddress {
  id: string;
  label: string;
  address: string;
  /**
   * The service area this address sits in, when the customer picked one.
   * Kept beside the text so checkout can price the order without asking for
   * the barangay again. Older entries have none and still load.
   */
  barangay?: string;
}

const key = (userId: string) => `kfd:addresses:${userId}`;

export async function loadAddresses(userId: string): Promise<SavedAddress[]> {
  if (!userId) return [];
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: a hand-edited or truncated store must not crash checkout.
    return parsed.filter(
      (a): a is SavedAddress =>
        !!a && typeof a.id === "string" && typeof a.address === "string"
    );
  } catch {
    return [];
  }
}

async function persist(userId: string, addresses: SavedAddress[]): Promise<void> {
  await AsyncStorage.setItem(key(userId), JSON.stringify(addresses));
}

/** Newest first. Returns the list to display, already persisted. */
export async function saveAddress(
  userId: string,
  address: string,
  label?: string,
  barangay?: string | null
): Promise<SavedAddress[]> {
  const trimmed = normaliseAddress(address);
  const area = (barangay ?? "").trim();
  const existing = await loadAddresses(userId);
  const created: SavedAddress = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: label?.trim() || addressLabelFor(trimmed),
    address: trimmed,
    barangay: area || undefined,
  };
  const next = [created, ...existing].slice(0, ADDRESS_LIMIT);
  await persist(userId, next);
  return next;
}

export async function deleteAddress(
  userId: string,
  id: string
): Promise<SavedAddress[]> {
  const next = (await loadAddresses(userId)).filter((a) => a.id !== id);
  await persist(userId, next);
  return next;
}

/** Forget this user's saved addresses on the device (account deletion). */
export async function clearAddresses(userId: string): Promise<void> {
  await AsyncStorage.removeItem(key(userId));
}
