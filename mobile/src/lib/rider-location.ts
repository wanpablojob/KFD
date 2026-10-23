/**
 * Share the rider's position while they have a job (0135), so the customer
 * can see them on the way.
 *
 * Foreground only: positions are sent while the rider app is open, which is
 * how riders work a delivery. The server keeps a position only while the rider
 * has an order, trip or pabakal in hand, and answers false otherwise -- then
 * the app reports far less often until a job starts.
 */

import { useEffect } from "react";
import * as Location from "expo-location";
import { supabase } from "./supabase";

/** How often to send while on a job, and while the server says there is none. */
export const ON_JOB_MS = 30_000;
export const OFF_JOB_MS = 120_000;

/** Whether enough time has passed since the last report to send another. */
export function dueToReport(
  lastSentAt: number | null,
  onJob: boolean,
  now: number
): boolean {
  if (lastSentAt === null) return true;
  return now - lastSentAt >= (onJob ? ON_JOB_MS : OFF_JOB_MS);
}

async function report(coords: Location.LocationObjectCoords): Promise<boolean> {
  const { data, error } = await supabase.rpc("rider_report_location", {
    p_latitude: coords.latitude,
    p_longitude: coords.longitude,
    p_accuracy: coords.accuracy ?? undefined,
  });
  return !error && data === true;
}

/** Mounted once in the rider layout. Does nothing if location is refused. */
export function useShareRiderLocation(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;
    let lastSentAt: number | null = null;
    let onJob = true;

    void (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted || cancelled) return;
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: ON_JOB_MS,
          distanceInterval: 50,
        },
        (position) => {
          const now = Date.now();
          if (!dueToReport(lastSentAt, onJob, now)) return;
          lastSentAt = now;
          void report(position.coords).then((kept) => {
            onJob = kept;
          });
        }
      );
      if (cancelled) subscription.remove();
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled]);
}

/** Where the customer's rider is, or null (not on the way yet, or no fresh position). */
export async function fetchRiderLocation(
  reference: string
): Promise<{ latitude: number; longitude: number; updatedAt: string } | null> {
  const { data, error } = await supabase.rpc("customer_rider_location", {
    p_reference: reference,
  });
  if (error) throw error;
  const row = data?.[0];
  return row
    ? { latitude: row.latitude, longitude: row.longitude, updatedAt: row.updated_at }
    : null;
}

/** "just now", "3 min ago". */
export function updatedAgo(iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  return minutes === 0 ? "just now" : `${minutes} min ago`;
}
