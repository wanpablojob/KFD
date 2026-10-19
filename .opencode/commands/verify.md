---
description: Run the full verification gate and report the evidence
agent: build
---

Run `scripts/verify.sh all` from the repo root and report the result.

- List every check as pass/fail, and include the exact failing output for anything red.
- Do not change files; this command only gathers evidence.
- If something failed, say what the failure means and the smallest fix you would make, but stop there and wait for direction.
