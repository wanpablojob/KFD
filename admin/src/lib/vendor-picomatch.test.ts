import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isMatch, makeRe } = require("../../vendor/picomatch/index.js") as {
  isMatch: (value: string, pattern: string) => boolean;
  makeRe: (pattern: string) => RegExp;
};

test("the advisory's repeated extglobs are escaped, not expanded", () => {
  assert.equal(makeRe("+(*a)").source, String.raw`^(?:\+\(\*a\))$`);
  assert.equal(makeRe("+(*)").source, String.raw`^(?:\+\(\*\))$`);
  assert.equal(makeRe("+(*?a)").source, String.raw`^(?:\+\(\*\?a\))$`);
});

test("crafted input cannot make the patched matcher backtrack", () => {
  for (const pattern of ["+(*)", "+(*a)", "+(*?a)"]) {
    const start = Date.now();
    assert.equal(isMatch("a".repeat(40) + "!", pattern), false);
    assert.ok(Date.now() - start < 1000, `${pattern} backtracked`);
  }
});

test("ordinary globs and safe extglobs still match", () => {
  assert.equal(isMatch("src/a.js", "src/**/*.js"), true);
  assert.equal(isMatch("docs/a.md", "src/**/*.js"), false);
  assert.equal(isMatch("foo", "+(foo|bar)"), true);
  assert.equal(isMatch("baz", "+(foo|bar)"), false);
});
