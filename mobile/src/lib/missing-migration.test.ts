import {
  detectMissingMigration,
  describeMissingMigration,
  missingMigrationMessage,
} from "./missing-migration";

/**
 * Telling a migration problem apart from a query problem.
 *
 * The rider app calls things that live in migrations which are written but not
 * applied, and PostgREST rejects the whole statement when one is missing. A
 * rider then reads "Could not load your rider profile" for what is really a
 * deploy that stopped at 0045.
 *
 * These assertions pin the narrow part of the contract: exactly the three
 * missing-thing failures are recognised, and anything else passes through
 * untouched. Passing through untouched is the half that matters most -- telling
 * someone to apply a migration when the real problem is their role sends them
 * somewhere useless, which is worse than the raw error.
 */

const GCASH = "0057_rider_gcash.sql";

test("a missing column is named, so the operator knows which file to apply", () => {
  const error = {
    code: "42703",
    message: "column riders.gcash_qr_url does not exist",
    details: null,
  };
  const problem = detectMissingMigration(error, GCASH);
  expect(problem).toEqual({
    kind: "column",
    migration: GCASH,
    column: "gcash_qr_url",
  });
});

test("a missing function is reported as a migration to apply", () => {
  const problem = detectMissingMigration(
    { code: "42883", message: "function rider_set_gcash(text, text) does not exist" },
    GCASH
  );
  expect(problem).toEqual({ kind: "function", migration: GCASH });
});

test("a schema-cache miss says reload, not apply", () => {
  // The failure that catches people out: db push succeeded, the row is in
  // schema_migrations, and the app still errors. Saying "apply the migration"
  // here would send the operator to run a command that has already been run.
  const problem = detectMissingMigration(
    { code: "PGRST202", message: "Could not find the function in the schema cache" },
    "0051_rider_notes_and_admin_insights.sql"
  );
  expect(problem).toEqual({
    kind: "schema-cache",
    migration: "0051_rider_notes_and_admin_insights.sql",
  });
});

test("a permission failure is NOT reported as a migration problem", () => {
  // The most important negative case. 42501 is an RLS/role rejection and is
  // fixed by granting something, not by applying a file.
  expect(
    detectMissingMigration(
      { code: "42501", message: "new row violates row-level security policy" },
      GCASH
    )
  ).toBeNull();
  expect(
    missingMigrationMessage({ code: "42501", message: "permission denied" }, GCASH)
  ).toBeNull();
});

test("an ordinary failure passes through untouched", () => {
  expect(detectMissingMigration(new Error("Network request failed"), GCASH)).toBeNull();
  expect(
    detectMissingMigration({ code: "23505", message: "duplicate key value" }, GCASH)
  ).toBeNull();
  expect(detectMissingMigration(undefined, GCASH)).toBeNull();
  expect(detectMissingMigration("a string", GCASH)).toBeNull();
});

test("the sentence names the file, and for a column the field", () => {
  const problem = detectMissingMigration(
    { code: "42703", message: "column riders.gcash_name does not exist" },
    GCASH
  );
  const text = describeMissingMigration(problem!);
  expect(text).toContain("gcash_name");
  expect(text).toContain(GCASH);
});

test("a column error with no parseable name still names the file", () => {
  // Postgres wording can vary; an unparseable name must not lose the migration,
  // which is the actionable half.
  const text = describeMissingMigration({
    kind: "column",
    migration: GCASH,
    column: "",
  });
  expect(text).toContain(GCASH);
});
