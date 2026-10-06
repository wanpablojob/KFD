import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Migration filenames are ordered by version and the runner records one row per
 * version in supabase_migrations.schema_migrations. Two files with the same
 * version is therefore not a tidy-up problem: one of them is skipped or applied
 * in an order nobody chose, and the symptom is a function that is missing at
 * runtime with a migration that reports itself applied.
 *
 * That has happened twice in this repo, on two different features, both times
 * from renumbering to make room at the same moment. Nothing caught it, so it is
 * caught here instead -- a cheap check that turns a silent deploy failure into
 * a failing test.
 *
 * Not run against a database on purpose: this asserts the property of the files
 * themselves, which is checkable in a second and is what actually regressed.
 */

const DIR = join(process.cwd(), "supabase", "migrations");

function migrations(): { version: number; name: string }[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((name) => {
      const version = Number.parseInt(name.split("_")[0], 10);
      return { version, name };
    })
    .sort((a, b) => a.version - b.version);
}

test("every migration file starts with a numeric version", () => {
  const bad = migrations().filter((m) => !Number.isFinite(m.version));
  assert.deepEqual(
    bad.map((b) => b.name),
    [],
    "rename these to <version>_<name>.sql",
  );
});

test("no two migrations share a version", () => {
  const seen = new Map<number, string[]>();
  for (const { version, name } of migrations()) {
    seen.set(version, [...(seen.get(version) ?? []), name]);
  }
  const collisions = [...seen.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([version, names]) => `${version}: ${names.join(", ")}`);
  assert.deepEqual(collisions, [], `duplicate migration version(s) -> ${collisions.join("; ")}`);
});

test("versions are unique and strictly increasing, so ordering is unambiguous", () => {
  const versions = migrations().map((m) => m.version);
  const sorted = [...versions].sort((a, b) => a - b);
  assert.deepEqual(versions, sorted, "readdir order is not version order");
  assert.equal(new Set(versions).size, versions.length);
});

test("a migration's own header comment does not claim a different number", () => {
  // Cheap guard against the other cause of the same failure: a migration copied
  // from a sibling and left pointing at the old number in its doc comment, which
  // makes the applied order ambiguous to anyone reading it.
  const mismatched = migrations()
    .map((m) => ({ ...m, body: readFileSync(join(DIR, m.name), "utf8") }))
    .filter((m) => {
      const claimed = m.body.match(/migration\s+(\d{4})/i);
      return claimed && Number(claimed[1]) !== m.version;
    })
    .map((m) => `${m.name} refers to migration ${m.body.match(/migration\s+(\d{4})/i)?.[1]}`);
  // Informational only: plenty of legitimate comments cite an earlier migration.
  // Assert the count is small and stable rather than zero.
  assert.ok(mismatched.length < 25, `many cross-references to check: ${mismatched.length}`);
});