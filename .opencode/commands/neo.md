---
description: Neo — plan, build, audit, commit, and push
agent: neo
model: opencode/big-pickle
---

Load the `kfd-build` and `kfd-ship` skills and run the full PLAN → BUILD → AUDIT → SHIP loop for:

$ARGUMENTS

Do not stop at "implemented"; prove it with the deterministic audit:

```sh
node scripts/neo-audit.mjs
```

Read `.opencode/neo/latest.md` and the actual diff. When the verdict is PASS, stage only the intended files, commit with a conventional message, and push with:

```sh
KFD_PUSH=1 git push
```

Report the phase, files changed, evidence, verdict, commit SHA, and CI run URL.
