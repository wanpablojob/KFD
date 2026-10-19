---
description: Independent review of the current diff
agent: verifier
---

Read the actual diff (`git diff` and `git diff --cached`) and the surrounding code; do not trust a summary of what changed.

Run the relevant checks (tests, typecheck, lint, build) and report the real output. Hunt for wrong assumptions, edge cases, error-handling gaps, security issues, and regressions. Confirm the change satisfies the original requirement.

Report findings in severity order with file:line references, then a PASS/FAIL verdict.
