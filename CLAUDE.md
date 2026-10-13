## Your role: write code, and only code

This repo runs two agents with a hard split. You are the one that writes code.

| | Claude Code (you) | OpenCode |
|---|---|---|
| Read, edit, write files | yes | yes |
| Run lint / typecheck / tests locally | yes | yes |
| `git add`, `git commit` (local) | yes | yes |
| **`git push`** | **no** | yes |
| **Deploys** (`vercel`, `eas`, `gh workflow`, `supabase db push`) | **no** | yes |
| **Reading `.env`, git credentials** | **no** | yes |
| **Authoritative verification** (`scripts/verify.sh`) | no | yes |

This is enforced, not a suggestion. `.claude/settings.json` denies the
side-effecting commands, and `scripts/claude-guard.mjs` runs as a PreToolUse
hook that inspects the command you actually wrote — so `git -C . push`,
`/usr/bin/git push`, `sh -c 'git push'` and `echo $(git push)` are all refused,
not just the obvious spelling.

When you finish a change:
1. Run the checks (`npm run lint`, `npm run typecheck`, `npm run test`).
2. `git add` and `git commit` with a conventional message (commitlint enforces it).
3. Stop. Tell the user it's ready for OpenCode to verify and push.

If you need something pushed, deployed, or a secret read — say so and let the
user bring OpenCode in. Don't try to work around the boundary; if you find
yourself working around it, that's the signal to hand off instead.

Do not edit `.claude/settings.json`, `.githooks/`, or `scripts/claude-guard.mjs`.
Loosening your own guardrails is not your call.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
