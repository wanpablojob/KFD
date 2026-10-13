/**
 * Telling a migration problem apart from a query problem.
 *
 * The rider app selects columns and calls functions that live in migrations
 * written but not yet applied to the project. When that happens PostgREST
 * rejects the whole statement, so a rider reads "Could not load your rider
 * profile" for what is really a deploy that stopped at 0045.
 *
 * Two failures look identical from the phone and have different fixes:
 *
 *   - 42703 undefined_column -- the column is not in the database. The migration
 *     has not been applied. Applying it is the fix.
 *   - 42883 / PGRST202 -- the *function* is missing, or is present but not in
 *     PostgREST's schema cache. PGRST202 is the one that catches people:
 *     `db push` succeeds, the row is in schema_migrations, and the app still
 *     errors because the cache was never re-read. Reloading is the fix.
 *
 * Deliberately narrow, for the same reason the admin's copy of this helper is
 * narrow: a permission error or an RLS rejection must pass through untouched.
 * Telling a rider to apply a migration when the real problem is their role
 * sends them somewhere useless, which is worse than the raw message.
 *
 * The admin app has its own equivalent in admin/src/lib/missing-migration.ts.
 * They are kept apart because the two apps deploy separately and sharing one
 * module across an app boundary is not worth the coupling.
 */

export const MISSING_COLUMN = "42703";
export const UNDEFINED_FUNCTION = "42883";
export const SCHEMA_CACHE_MISS = "PGRST202";

interface PostgrestErrorLike {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

function asPostgrestError(cause: unknown): PostgrestErrorLike | null {
  if (typeof cause !== "object" || cause === null) return null;
  const candidate = cause as PostgrestErrorLike;
  return typeof candidate.message === "string" || typeof candidate.code === "string"
    ? candidate
    : null;
}

export type MissingMigration =
  | { kind: "column"; migration: string; column: string }
  | { kind: "function"; migration: string }
  | { kind: "schema-cache"; migration: string };

/**
 * Recognise the "a migration is not applied yet" failure, or return null so the
 * caller rethrows the original error untouched.
 *
 * `migration` is supplied by the caller because only it knows which file owns
 * the column or function. Guessing here would be how a wrong-file message gets
 * invented, so it is never inferred.
 */
export function detectMissingMigration(
  cause: unknown,
  migration: string
): MissingMigration | null {
  const error = asPostgrestError(cause);
  if (!error) return null;

  const code = error.code ?? "";
  const message = `${error.message ?? ""} ${error.details ?? ""}`.trim();

  if (code === SCHEMA_CACHE_MISS || /in the schema cache/i.test(message)) {
    return { kind: "schema-cache", migration };
  }
  if (code === UNDEFINED_FUNCTION) {
    return { kind: "function", migration };
  }
  if (code === MISSING_COLUMN) {
    // PostgREST names the column; surfacing it saves the operator reading the
    // migration list to work out which one owns it.
    const column = /column\s+[\w.]+\.([\w]+)\s+does not exist/i.exec(message)?.[1];
    return { kind: "column", migration, column: column ?? "" };
  }
  return null;
}

/**
 * A sentence a rider can act on, or null when this is not a migration problem.
 *
 * The customer of this string is a developer holding a phone that says their
 * rider profile will not load, so it names the file and says what to run.
 */
export function describeMissingMigration(problem: MissingMigration): string {
  switch (problem.kind) {
    case "schema-cache":
      return `The server has the update but has not reloaded it. Restart the project or reload the API schema, then try again. (Affected by ${problem.migration}.)`;
    case "function":
      return `This part of the app is not deployed yet. Apply ${problem.migration} and try again.`;
    case "column":
      return problem.column
        ? `This part of the app is not deployed yet: the server has no "${problem.column}" field. Apply ${problem.migration} and try again.`
        : `This part of the app is not deployed yet. Apply ${problem.migration} and try again.`;
  }
}

/** One-shot: recognise the failure and return the sentence, or null. */
export function missingMigrationMessage(
  cause: unknown,
  migration: string
): string | null {
  const problem = detectMissingMigration(cause, migration);
  return problem ? describeMissingMigration(problem) : null;
}
