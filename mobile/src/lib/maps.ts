/**
 * Opening the device's maps app for a delivery address.
 *
 * There is no maps SDK and no location permission anywhere in this app, and
 * there does not need to be: the rider's phone already has a maps app, and all
 * this has to do is hand it an address. A `geo:` URL opens whatever the device
 * has registered as a maps handler, and a `maps:` URL is the iOS spelling. No
 * dependency, no permission prompt, no coordinate this app does not have.
 *
 * The coordinate question is the reason this takes an address at all: orders
 * store a free-text address, not a lat/lng pair (there is no geocoding), so a
 * query URL is the only honest thing to build. A `geo:0,0?q=` with a search
 * string works on Android; on iOS `maps:?q=` does the same. Anything that cannot
 * be turned into a URL returns null, so the caller renders no button rather than
 * a dead one.
 */

import { Linking, Platform } from "react-native";

/**
 * A link that opens the maps app pointed at `address`, or null if there is
 * nothing to point at.
 *
 * `Platform.OS` is a parameter so this is testable without mocking react-native.
 */
export function mapsUrl(
  address: string | null,
  platform: "ios" | "android" | "web"
): string | null {
  const query = (address ?? "").trim();
  // A single character is not an address, and a blank one is the common case for
  // orders placed before addresses existed. Neither is worth a button.
  if (query.length < 3) return null;

  const encoded = encodeURIComponent(query);

  if (platform === "ios") return `maps:?q=${encoded}`;
  if (platform === "android") return `geo:0,0?q=${encoded}`;
  return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

/** The device-platform variant, the one screens actually call. */
export function deviceMapsUrl(address: string | null): string | null {
  return mapsUrl(
    address,
    Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web"
  );
}

/** Opens the maps app. Best-effort: a device with no maps app fails silently. */
export async function openInMaps(address: string | null): Promise<void> {
  const url = deviceMapsUrl(address);
  if (!url) return;
  await Linking.openURL(url).catch(() => undefined);
}
