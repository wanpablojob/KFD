import { test } from "node:test";
import assert from "node:assert/strict";
import { anyIlikeFilter, escapeLikeTerm } from "./ilike-filter.ts";

/**
 * The search term is the only untrusted input that reaches a filter string, and
 * every failure here is silent: a wildcard returns too many rows, an unescaped
 * comma silently widens the filter to other tables' worth of columns. No
 * exception, no red build, just wrong results.
 */

test("a plain term is untouched", () => {
  assert.equal(escapeLikeTerm("Anna"), "Anna");
  assert.equal(escapeLikeTerm("D & D"), "D & D");
  assert.equal(escapeLikeTerm("  spaced  "), "  spaced  ");
});

test("a percent sign is escaped, not treated as a wildcard", () => {
  assert.equal(escapeLikeTerm("50%"), "50\\%");
  assert.equal(escapeLikeTerm("%"), "\\%");
});

test("an underscore is escaped, so it is a literal underscore", () => {
  assert.equal(escapeLikeTerm("a_b"), "a\\_b");
});

test("a comma is escaped, so it cannot inject another OR branch", () => {
  assert.equal(escapeLikeTerm("x,y"), "x\\,y");
});

test("a backslash is escaped before anything else, doubling it", () => {
  assert.equal(escapeLikeTerm("a\\b"), "a\\\\b");
});

test("escaping does not double up across repeated characters", () => {
  assert.equal(escapeLikeTerm("100%_\\"), "100\\%\\_\\\\");
});

test("the escape character is itself escapable", () => {
  // A term ending in a single backslash must not escape the wildcard we add.
  const filter = anyIlikeFilter(["name"], "x\\");
  assert.equal(filter, "name.ilike.%x\\\\%");
});

test("or() filter applies the same pattern to every column", () => {
  assert.equal(
    anyIlikeFilter(["name", "cuisine"], "D & D"),
    "name.ilike.%D & D%,cuisine.ilike.%D & D%",
  );
});

test("or() filter escapes once and shares the pattern", () => {
  assert.equal(
    anyIlikeFilter(["name", "email"], "a,b"),
    "name.ilike.%a\\,b%,email.ilike.%a\\,b%",
  );
});
