---
description: Audit, verify, commit, and push to GitHub
agent: build
---

Load the `kfd-ship` skill and ship the current change.

1. `git status --short` and `git diff`; stage only the intended files.
2. Run `npm audit --omit=dev --audit-level=high` in `admin` and `npm audit --omit=dev` in `mobile`; read the advisories.
3. Run `scripts/verify.sh all`; required checks must pass.
4. Commit with a conventional message if there are uncommitted changes.
5. Push with `KFD_PUSH=1 git push`.
6. Report the branch, the commit SHA, and the CI run URL.
