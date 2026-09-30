import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards against a table name being replaced with a route path.
 *
 * The bug: when the admin dashboard moved under /dashboard, a find-and-replace
 * over the route paths also rewrote every Supabase `.from("orders")` into
 * `.from("/dashboard/orders")`. PostgREST then resolved those to
 * /rest/v1/dashboard/orders and answered 404 PGRST125, so every dashboard read
 * failed with "Could not load dashboard data". TypeScript stayed green because
 * the mangled names were string literals used consistently, including in a
 * hand-written union type -- so nothing flagged it.
 *
 * This test is the cheap tripwire that catches the next one of these before it
 * reaches the browser. Any `.from("/…")` is a route, not a table.
 */

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

// src/lib/ -> ../.. is the admin package root, which holds src/.
const srcRoot = new URL("../..", import.meta.url).pathname;
// This file quotes the bad pattern in its own docs and regex, so it has to
// exempt itself or it reports itself.
const SELF = "table-names.test.ts";
const files = sourceFiles(join(srcRoot, "src")).filter(
  (file) => !file.endsWith(SELF),
);

test("found the source tree to scan", () => {
  assert.ok(files.length > 10, `expected source files, found ${files.length}`);
});

test("no Supabase .from() is given a route path instead of a table name", () => {
  const offenders: string[] = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    // Array.from / Object.from are not Supabase calls; match `.from("/`.
    for (const match of source.matchAll(/\.from\(\s*"\/[^"]*"/g)) {
      const line = source.slice(0, match.index).split("\n").length;
      offenders.push(`${file}:${line} ${match[0]}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Supabase table name replaced by a route path:\n${offenders.join("\n")}`,
  );
});

test("no table-name union type was replaced by a route path", () => {
  const offenders: string[] = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/:\s*"\/[^"]*"\s*\|\s*"\/[^"]*"/g)) {
      const line = source.slice(0, match.index).split("\n").length;
      offenders.push(`${file}:${line} ${match[0]}`);
    }
  }

  assert.deepEqual(offenders, [], `Mangled type union:\n${offenders.join("\n")}`);
});
