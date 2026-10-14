import * as Sentry from "@sentry/nextjs";

/**
 * Report a server error that a route handles by returning a 5xx instead of
 * throwing, so it never reaches onRequestError. A no-op unless Sentry was
 * initialised (SENTRY_DSN set, see src/instrumentation.ts).
 */
export function reportServerError(error: unknown, route: string): void {
  const err =
    error instanceof Error
      ? error
      : new Error(
          typeof error === "object" && error && "message" in error
            ? String((error as { message: unknown }).message)
            : String(error)
        );
  Sentry.captureException(err, { tags: { route } });
}
