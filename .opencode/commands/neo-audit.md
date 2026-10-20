---
description: Neo — audit the current diff
agent: neo
model: opencode/big-pickle
---

Audit the current working change. Do not edit, commit, or push in this command.

1. Run the deterministic audit:

   ```sh
   node scripts/neo-audit.mjs
   ```

2. Read `.opencode/neo/latest.md`, then inspect the actual diff (`git status --short`, `git diff`, `git diff --cached`) and the surrounding code.
3. For a risky or cross-cutting diff, launch the `verifier` subagent for an independent review on a different model.
4. Report findings in severity order with file:line references, then a PASS/BLOCKED verdict and the path to the audit artifact.
