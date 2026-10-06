/**
 * Telling a deploy problem apart from a query problem.
 *
 * Several pages here call security-definer functions that live in migrations
 * written but not yet applied. When one is missing, the raw PostgREST error
 * reaches the UI naming an internal symbol and saying nothing about what to do
 * about it. This turns that into one sentence a deployer can act on.
 *
 * The distinction that earns its keep is between the two failures that look
 * identical from the browser:
 *
 *   - 42883 -- the function is not in the database. The migration has not been
 *     applied. Applying it is the fix.
 *   - PGRST202 -- the function *is* in the database but PostgREST has not re-read
 *     its schema cache, so it is not routing calls to it. This is the one that
 *     catches people: `supabase db push` succeeds, the row is in
 *     supabase_migrations.schema_migrations, and the page still errors. Reloading
 *     is the fix, not re-applying.
 *
 * Deliberately narrow. A permission error or an RLS rejection returns null so it
 * passes through untouched -- telling someone to apply a migration when the
 * actual problem is a role would send them down the wrong path, which is worse
 * than the original message.
 */

interface RpcErrorLike {
  message?: string;
  code?: string;
}

/** Postgres: undefined_function. */
const UNDEFINED_FUNCTION = "42883";
/** PostgREST: the function is not in its schema cache. */
const SCHEMA_CACHE_MISS = "PGRST202";

const SCHEMA_CACHE_PHRASE = "in the schema cache";

export function describeRpcFailure(
  cause: unknown,
  migration?: string,
): string | null {
  const { message, code } = readError(cause);
  if (!message) return null;

  const isUndefinedFunction =
    code === UNDEFINED_FUNCTION || /function .* does not exist/i.test(message);
  const isCacheMiss =
    code === SCHEMA_CACHE_MISS || message.includes(SCHEMA_CACHE_PHRASE);

  if (!isUndefinedFunction && !isCacheMiss) return null;

  const where = migration ? ` (migration ${migration})` : "";

  if (isCacheMiss) {
    return (
      `This page needs a database function PostgREST has not picked up${where}. ` +
      `If the migration is applied, reload the PostgREST schema cache ` +
      `(supabase db push --dry-run is not enough; use the project dashboard's ` +
      `reload, or NOTIFY pgrst, 'reload schema') and try again.`
    );
  }

  return (
    `This page needs a database function that does not exist yet${where}. ` +
    `Apply the migration, then reload the PostgREST schema cache.`
  );
}

function readError(cause: unknown): RpcErrorLike {
  if (cause instanceof Error) return { message: cause.message };
  if (typeof cause === "object" && cause !== null) {
    const record = cause as Record<string, unknown>;
    return {
      message: typeof record.message === "string" ? record.message : undefined,
      code: typeof record.code === "string" ? record.code : undefined,
    };
  }
  if (typeof cause === "string") return { message: cause };
  return {};
}