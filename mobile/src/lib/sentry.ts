import * as Sentry from "@sentry/react-native";

/**
 * Initialize Sentry for crash reporting and performance monitoring.
 * Call this once at app startup (in _layout.tsx before any providers).
 */
export function initSentry() {
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
  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Set user context for Sentry (called after successful sign-in).
 */
export function setSentryUser(user: { id: string; email?: string; role?: string }) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    role: user.role,
  });
}

/**
 * Clear user context (called on sign-out).
 */
export function clearSentryUser() {
  Sentry.setUser(null);
}

/**
 * Add breadcrumb for user actions (navigation, button taps, etc.)
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>
) {
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level: "info",
  });
}
