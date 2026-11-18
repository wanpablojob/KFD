# Local security patch

This is picomatch 4.0.7 (MIT, Jon Schlinkert) with one locally applied fix.
It is versioned `4.0.8` so npm treats it as outside the affected range
(`<=4.0.7`). PATCH.md records the difference from upstream.

## What changed

`lib/parse.js` now treats a branch containing a top-level `*` as a risky
repeated extglob. Outside a repeated extglob (`+(...)`, `*(...)`) nothing
changes. Inside one, picomatch now escapes the extglob instead of emitting a
regex with nested unbounded quantifiers.

This closes the ReDoS in GHSA-fc5q-39xc-vjpf / CVE-2026-112366. Patterns from
the advisory, such as `+(*)` and `+(*a)`, previously compiled to regexes like
`^(?:(?=.)(?:[^/]*?a)+)$`, which backtracks exponentially on input such as
`'a'.repeat(n) + '!'`.

No patched upstream release existed at the time (4.0.7 was the latest
published version). Upstream PR #194 was not used as-is because it also
changes how `?` starts an extglob, which alters ordinary glob matching.

## How it is used

`admin/package.json` lists this directory as a direct dependency and uses
`"$picomatch"` overrides inside `@rollup/plugin-commonjs`,
`@rollup/pluginutils`, and `fdir` so npm uses this copy in the production
chain. The unrelated 2.x copy used by micromatch through the linter is left
untouched.
