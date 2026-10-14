import * as Sentry from "@sentry/nextjs";

/**
 * Server error reporting for the admin app's API routes (push, dispatch,
 * order notifications), which were otherwise invisible. Reports only when
 * SENTRY_DSN is set in the deployment; without it Sentry stays a no-op, so
 * local runs and previews send nothing.
 */
export function register() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Errors only; performance tracing is not needed yet.
    tracesSampleRate: 0,
  });
}

/** Errors Next.js catches while handling a request (thrown in a route or page). */
export const onRequestError = Sentry.captureRequestError;
