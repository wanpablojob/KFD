import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

/**
 * The Supabase types both apps compile against are generated from the
 * migrations by scripts/gen-db-types.sh, and the same file is written to both.
 *
 * They used to be maintained by hand -- the mobile copy covering only what the
 * app touched -- and drifted from the schema in both directions: functions the
 * code called that no type described, and an `items: OrderItem[]` that hid a
 * screen skipping its own validation. These two checks keep it from creeping
 * back:
 *
 *   1. adding a migration without regenerating fails here, by the stamp;
 *   2. the admin and mobile copies must stay byte-identical.
 */

const ADMIN_TYPES = join(process.cwd(), "src", "lib", "supabase", "database.types.ts");
const MOBILE_TYPES = join(process.cwd(), "..", "mobile", "src", "lib", "database.generated.ts");
const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function latestMigration(): string {
  return readdirSync(MIGRATIONS)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
    .at(-1)!;
}

test("the generated types were built from the newest migration", () => {
  const header = readFileSync(ADMIN_TYPES, "utf8").split("\n").slice(0, 3).join("\n");
  const stamp = /through (\S+)\./.exec(header)?.[1];
  assert.ok(stamp, "database.types.ts has no generator stamp -- run scripts/gen-db-types.sh");
  assert.equal(
    stamp,
    latestMigration(),
    "a migration was added after the types were generated -- run scripts/gen-db-types.sh",
  );
});

test("the generated types were built from the migrations as they are now", () => {
  // The stamp above only notices a NEW file. Editing an existing migration --
  // a fix to one not yet applied, say -- changes the schema just the same.
  const header = readFileSync(ADMIN_TYPES, "utf8").split("\n").slice(0, 4).join("\n");
  const stamped = /migrations sha256 ([0-9a-f]{64})/.exec(header)?.[1];
  assert.ok(stamped, "database.types.ts has no migrations digest -- run scripts/gen-db-types.sh");
  const files = readdirSync(MIGRATIONS)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();
  const digest = createHash("sha256");
  for (const f of files) digest.update(readFileSync(join(MIGRATIONS, f)));
  assert.equal(
    digest.digest("hex"),
    stamped,
    "a migration changed after the types were generated -- run scripts/gen-db-types.sh",
  );
});

test("the admin and mobile copies of the types are identical", () => {
  assert.equal(
    readFileSync(MOBILE_TYPES, "utf8"),
    readFileSync(ADMIN_TYPES, "utf8"),
    "admin and mobile database types differ -- run scripts/gen-db-types.sh, never edit either copy",
  );
});
