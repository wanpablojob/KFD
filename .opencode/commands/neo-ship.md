---
description: Neo — verify, commit, and push to GitHub
agent: neo
model: opencode/big-pickle
---

Load the `kfd-ship` skill and ship the current change.

1. `git status --short` and `git diff`; stage only the intended files.
2. Run the deterministic audit:

   ```sh
   node scripts/neo-audit.mjs
   ```

   It runs `scripts/verify.sh all`, the production dependency audits, captures the real diff, scans for secrets, and writes `.opencode/neo/latest.md`.
3. Read the artifact. Stop and report if the verdict is BLOCKED; do not bypass the gate.
4. Commit with a conventional message if there are uncommitted changes.
5. Push with `KFD_PUSH=1 git push`.
6. Watch CI (`gh run list --limit 1`, then `gh run watch <run-id> --exit-status`). If it fails, read `gh run view <run-id> --log-failed`, fix the cause, rerun the audit, and push the fix.
7. Report the branch, the commit SHA, and the CI run URL.
