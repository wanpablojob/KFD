import Constants from "expo-constants";

/**
 * Sentry, kept out of Expo Go's execution path.
 *
 * Expo Go runs a fixed native runtime that does not include Sentry's `RNSentry`
 * module. The SDK guards most of its own native access, but the app must not
 * depend on that guard: a development client, a production build and Expo Go all
 * need to start, and the only one that cannot run Sentry is the one a developer
 * reaches for first.
 *
 * So the SDK is loaded lazily and only off Expo Go. When running in Expo Go this
 * module is a complete no-op -- every function below returns before touching the
 * SDK -- and it never executes `@sentry/react-native`'s module body, which is
 * where its native bridge is set up. Dev and production builds get the real SDK
 * exactly as before.
 *
 * `appOwnership === "expo"` is the Expo Go signal specifically. The recommended
 * `executionEnvironment === "storeClient"` also matches a development build
 * (which *does* include the native module), so it would disable Sentry there
 * too -- wrong tool for this check. `expoGoConfig` is checked alongside it
 * because `appOwnership` is deprecated and undefined is not a safe default here.
 */
const isExpoGo = Constants.appOwnership === "expo" || Constants.expoGoConfig != null;

type SentryModule = typeof import("@sentry/react-native");

let cached: SentryModule | null | undefined;

function loadSentry(): SentryModule | null {
  if (isExpoGo) return null;
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("@sentry/react-native") as SentryModule;
  } catch (error) {
    if (__DEV__) {
      console.warn("[Sentry] SDK unavailable, continuing without it", error);
    }
    cached = null;
  }
  return cached;
}

/**
 * Initialize Sentry for crash reporting and performance monitoring.
 * Call this once at app startup (in _layout.tsx before any providers).
 */
export function initSentry() {
  const Sentry = loadSentry();
  if (!Sentry) return;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    if (__DEV__) {
      console.warn("[Sentry] EXPO_PUBLIC_SENTRY_DSN not set, skipping initialization");
    }
    return;
  }

  Sentry.init({
    dsn,
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30000,
    tracesSampleRate: 0.1,
    profilesSampleRate: 0.1,
    environment: __DEV__ ? "development" : "production",
    release: process.env.EXPO_PUBLIC_EAS_PROJECT_ID
      ? `${process.env.EXPO_PUBLIC_EAS_PROJECT_ID}@${process.env.EXPO_PUBLIC_EAS_BUILD_VERSION ?? "1.0.0"}`
      : undefined,
    beforeSend(event, hint) {
      // Filter out known non-actionable errors
      if (event.exception) {
        for (const exc of event.exception.values ?? []) {
          if (exc.value?.includes("Network request failed")) {
            return null; // Drop network errors (handled by retry UX)
          }
          if (exc.value?.includes("ChunkLoadError")) {
            return null; // Drop chunk load errors (transient)
          }
        }
      }
      return event;
    },
    integrations: [Sentry.reactNativeTracingIntegration()],
  });

  if (__DEV__) {
    console.log("[Sentry] Initialized");
  }
}

/**
 * Capture an error with optional context.
 * Use this in catch blocks for handled errors you want to track.
 */
export function captureError(error: unknown, context?: Record<string, unknown>) {
  loadSentry()?.captureException(error, {
    extra: context,
  });
}

/**
 * Set user context for Sentry (called after successful sign-in).
 */
export function setSentryUser(user: { id: string; email?: string; role?: string }) {
  loadSentry()?.setUser({
    id: user.id,
    email: user.email,
    role: user.role,
  });
}

/**
 * Clear user context (called on sign-out).
 */
export function clearSentryUser() {
  loadSentry()?.setUser(null);
}

/**
 * Add breadcrumb for user actions (navigation, button taps, etc.)
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>
) {
  loadSentry()?.addBreadcrumb({
    category,
    message,
    data,
    level: "info",
  });
}
