import * as Notifications from "expo-notifications";
import type { EventSubscription } from "expo-modules-core";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import Constants from "expo-constants";

/**
 * Expo Push client (Prompt 6.2).
 *
 * The registration endpoint lives in the admin app (it holds the service role
 * key); the mobile bundle only carries the signed-in user's access token plus
 * the public API host. Everything here is deliberately a thin client over that
 * route: no service role key, no direct push_tokens writes.
 */

// The admin app's base URL. Public by necessity -- a device has to reach it.
const apiUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;

// The EAS project id is what Expo uses to attribute a push token to this app.
// Reading it from the app config keeps Expo Go / EAS builds working without a
// second secret.
const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;

const DEVICE_ID_KEY = "kfd.push.deviceId";
const REGISTERED_KEY = "kfd.push.registered";

// Register/unregister calls must settle quickly; a hung admin API should not
// leave the toggle spinning indefinitely.
const REGISTER_TIMEOUT_MS = 10_000;

// A single foreground handler is enough for the whole app: new-order alerts
// surface even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Stable per-install device id. Used as push_tokens.id so re-registering the
 * same install overwrites its row. A reinstall is a new device, so a fresh id
 * after one is correct, and SecureStore survives normal reloads.
 */
async function getOrCreateDeviceId(): Promise<string> {
  const cached = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (cached) return cached;

  // No Math.random-based id can collide meaningfully here: a device id is a
  // label for the install, not a secret, and the true identity is the token
  // (the table's unique column).
  const id = `${Platform.OS}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

export interface PushStatus {
  /** true when the OS permission for notifications is granted. */
  granted: boolean;
  /** true when this install successfully registered a device id. */
  registered: boolean;
  /** Set when something genuinely failed and the user needs to act. */
  error?: string;
}

function pushPlatform(): "ios" | "android" {
  if (Platform.OS === "android") return "android";
  return "ios";
}

async function register(accessToken: string, timeoutMs: number): Promise<boolean> {
  if (!apiUrl || !projectId) return false;
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  const deviceId = await getOrCreateDeviceId();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiUrl}/api/push/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        deviceId,
        token: token.data,
        platform: pushPlatform(),
      }),
      signal: controller.signal,
    });
    return res.ok;
  } finally {
    clearTimeout(timer);
  }
}

export async function getPushStatus(): Promise<PushStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  const granted = status === "granted";
  const registered = (await SecureStore.getItemAsync(REGISTERED_KEY)) === "1";
  return { granted, registered };
}

/**
 * Called from the UI when the user opts in. The OS prompt is a hard stop, so
 * the toggle copy must explain why before this runs.
 */
export async function enablePush(accessToken: string): Promise<PushStatus> {
  if (!Device.isDevice) {
    return {
      granted: false,
      registered: false,
      error: "Push notifications need a physical device, not an emulator.",
    };
  }

  if (!apiUrl) {
    return {
      granted: false,
      registered: false,
      error: "EXPO_PUBLIC_API_URL is not configured on this build.",
    };
  }

  if (!projectId) {
    return {
      granted: false,
      registered: false,
      error: "EAS projectId is not configured, so Expo cannot issue a push token.",
    };
  }

  // Android 8+ needs a channel before any notification can show; the send path
  // addresses it by name.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("orders", {
      name: "Order alerts",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") {
    return {
      granted: false,
      registered: false,
      error:
        "Notifications were denied. Allow KFD notifications in system settings to receive order alerts.",
    };
  }

  const ok = await register(accessToken, REGISTER_TIMEOUT_MS).catch(() => false);
  if (!ok) {
    return {
      granted: true,
      registered: false,
      error: "Could not register this device with the server.",
    };
  }

  await SecureStore.setItemAsync(REGISTERED_KEY, "1");
  return { granted: true, registered: true };
}

export async function disablePush(accessToken: string): Promise<void> {
  const deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  await SecureStore.deleteItemAsync(REGISTERED_KEY);

  if (!apiUrl || !deviceId) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REGISTER_TIMEOUT_MS);
  await fetch(`${apiUrl}/api/push/register?deviceId=${encodeURIComponent(deviceId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: controller.signal,
  })
    .catch(() => {
      // Best-effort. A stale row is overwritten by token on the next register,
      // so a failed unregister costs nothing permanent.
    })
    .finally(() => clearTimeout(timer));
}

/**
 * Expo can reissue a token (permission changes, reinstall). Listen for that
 * and re-register in place so the device does not go silently deaf.
 */
export function watchForTokenRotation(
  accessToken: string,
  onRegistered: (registered: boolean) => void
): EventSubscription {
  return Notifications.addPushTokenListener(async () => {
    if (!projectId || !apiUrl) return;

    const ok = await register(accessToken, REGISTER_TIMEOUT_MS).catch(() => false);
    onRegistered(ok);
  });
}

/**
 * Tells the server a delivery completed, so the rider's other devices can be
 * alerted. Fired fire-and-forget after `rider_mark_delivered` has already
 * succeeded: the delivery is recorded either way, so a failure here is silent
 * by design and never blocks the rider or shows an error.
 *
 * The rider who taps the button is on this device, so the visible result is
 * this app refreshing itself. The push exists for the rider's *other* devices.
 */
export async function notifyRiderDelivered(
  accessToken: string,
  orderId: string
): Promise<void> {
  if (!apiUrl) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REGISTER_TIMEOUT_MS);
  await fetch(`${apiUrl}/api/push/rider`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orderId }),
    signal: controller.signal,
  })
    .catch(() => {
      // Best-effort, as documented.
    })
    .finally(() => clearTimeout(timer));
}
