import { test } from "node:test";
import assert from "node:assert/strict";
import { describeRpcFailure } from "./missing-migration.ts";

/**
 * The riders pages call security-definer functions added by migrations that have
 * been written but not applied. When one is missing, PostgREST's error reaches
 * the UI as a wall of Postgres text naming an internal symbol, which tells the
 * person deploying nothing about what to do.
 *
 * These cover the two failures that look alike from the UI and mean different
 * things to whoever has to fix it:
 *
 *   - the function is not in the database at all (never applied),
 *   - the function IS in the database but PostgREST has not re-read its schema
 *     cache, so it is not routing to it.
 *
 * The second is the one that catches people: the SQL is applied, `supabase db
 * push` says so, and the page still errors.
 */

test("recognises an undefined function (42883)", () => {
  const message = describeRpcFailure(
    {
      message: "function public.admin_rider_payout_summary(text) does not exist",
      code: "42883",
    },
    "0058_admin_rider_ledger.sql",
  );
  assert.ok(message);
  assert.match(message, /0058_admin_rider_ledger\.sql/);
  assert.match(message, /does not exist|not been applied/i);
});

test("recognises PostgREST's schema-cache miss (PGRST202)", () => {
  const message = describeRpcFailure(
    {
      message:
        "Could not find the function public.admin_rider_payouts(p_rider_id,p_limit) in the schema cache.",
      code: "PGRST202",
    },
    "0058_admin_rider_ledger.sql",
  );
  assert.ok(message);
  // The distinguishing instruction: reloading, not re-applying.
  assert.match(message, /schema cache/i);
  assert.match(message, /reload/i);
});

test("names the migration when one is supplied", () => {
  const message = describeRpcFailure(
    { message: "boom", code: "42883" },
    "0064_rider_application_reviewer.sql",
  );
  assert.match(message ?? "", /0064_rider_application_reviewer\.sql/);
});

test("passes an ordinary failure through untouched", () => {
  // A permission error is not a deployment problem and must not be dressed up
  // as one -- "apply this migration" would send someone down the wrong path.
  assert.equal(
    describeRpcFailure({ message: "permission denied for function", code: "42501" }),
    null,
  );
  assert.equal(describeRpcFailure({ message: "row-level security", code: "42501" }), null);
  assert.equal(describeRpcFailure(null), null);
  assert.equal(describeRpcFailure(undefined), null);
  assert.equal(describeRpcFailure(new Error("network down")), null);
});

test("ignores an error that merely mentions a function name", () => {
  // "Admins only." is what our own RPC raises. It must not be mistaken for a
  // missing function, or a permissions bug would be reported as a deploy step.
  assert.equal(
    describeRpcFailure({ message: "Admins only.", code: "P0001" }),
    null,
  );
});

test("still recognises the schema-cache failure from its text alone", () => {
  // Supabase surfaces this without a code in some paths, and the message is the
  // only thing left to go on.
  const message = describeRpcFailure({
    message: "Could not find the function public.foo() in the schema cache.",
  });
  assert.match(message ?? "", /schema cache/i);
});