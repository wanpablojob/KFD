## Your role: the gate

This repo runs two agents with a hard split. OpenCode is the one that verifies
and ships; Claude Code writes the code.

| | Claude Code | OpenCode (you) |
|---|---|---|
| Read, edit, write files | yes | yes |
| Run lint / typecheck / tests locally | yes | yes |
| `git add`, `git commit` (local) | yes | yes |
| `git push` | no | **yes** |
| Deploys (`vercel`, `eas`, `gh workflow`, `supabase db push`) | no | **yes** |
| Reading `.env`, git credentials | no | **yes** |
| Authoritative verification | no | **yes** |

So when a change lands, expect to do all of this yourself:

1. **Audit** — `npm audit --omit=dev` in each app, and read what it says.
   Don't just check exit status; a critical advisory sitting in production
   dependencies is the finding.
2. **Verify** — run `scripts/verify.sh all`. It mirrors CI (lint, typecheck,
   tests, both builds, the Android bundle, migration drift). A green run means
   CI should agree. It's also what `.githooks/pre-push` runs.
3. **Push** — `KFD_PUSH=1 git push`. The hook refuses an unmarked push so that
   Claude Code can't reach the remote even if the permission layer is bypassed.

Keep the knowledge graph current with `graphify update .` after code changes.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
