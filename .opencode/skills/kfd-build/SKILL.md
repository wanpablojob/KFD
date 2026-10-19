---
name: KFD Build
description: Use when implementing, changing, or fixing code in the KFD monorepo. The plan-first build loop for admin (Next.js), mobile (Expo SDK 57), Supabase migrations, and scripts, with targeted checks, the full verification gate, subagent orchestration, and a build journal.
---

# KFD build loop

This skill changes nothing about what the agent may do. Edit, shell, `git commit`, and `KFD_PUSH=1 git push` all stay available. It only makes the loop deliberate and evidence-based.

## 0. Scope before touching code

- Restate the goal and the acceptance criteria in one or two sentences. If either is unclear, ask before editing.
- For a large or ambiguous change, launch the `architect` subagent for an ordered plan and the `explore` subagent for discovery, in parallel when they are independent. Keep their output narrow; do not paste whole files into the main thread.
- Query the knowledge graph before raw searches: `graphify query "<question>"`. Use `graphify path "A" "B"` for relationships and `graphify explain "<concept>"` for focused concepts. Fall back to targeted reads, not whole-file dumps.
- Check the memory MCP for prior facts about the area. If none exist, note that and continue.

## 1. Route the change

| Path | Surface | Targeted checks |
| --- | --- | --- |
| `admin/` | Next.js admin + public web | `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` |
| `mobile/` | Expo SDK 57 app | `npm run lint`, `npm run typecheck`, `npm run test` |
| `supabase/` | SQL migrations | read the preflight skill first; run admin migration tests |
| `scripts/` | Gate and harness tooling | `scripts/verify.sh`, `node scripts/claude-guard.mjs --self-test` |
| root / `.github/` | Shared config, CI | `scripts/verify.sh all` |

The admin and mobile copies of `database.generated.ts` must stay identical to each other; changes to one usually require the other.

## 2. Know the version traps

- **Next.js**: training data is stale. Before using an API, read the relevant guide under `admin/node_modules/next/dist/docs/`.
- **Expo**: training data is stale. Read the exact versioned docs at <https://docs.expo.dev/versions/v57.0.0/> before writing code.
- **Supabase**: a reachable database can still disagree with the migrations. Load the `preflight` skill before debugging empty screens or touching schema, RLS, or RPCs.
- **Generated types**: regenerate rather than hand-edit `database.generated.ts` and `database.types.ts`.
- **Rider app**: load the `rider-delivery-phases` skill before touching rider UI, dispatch, or assignment logic.

## 3. Make the smallest change

- Prefer one focused edit per file over a rewrite. Match the surrounding conventions.
- Do not reformat untouched code, rename unrelated symbols, or refactor while fixing.
- If a test proves the bug, write or adjust the failing test first, then fix the cause. The `debugging` skill is the procedure: no fix without a reproduced, named cause.

## 4. Run targeted checks first

- Admin: `cd admin && npm run lint && npm run typecheck && npm run test`. Add `npm run build` when routes, config, or server code changed.
- Mobile: `cd mobile && npm run lint && npm run typecheck && npm run test`. Add an Android bundle check when native dependencies, `app.json`, or bundler config changed.
- A green `tsc --noEmit` is not proof the mobile app bundles; the bundle can fail on a dependency that types fine.
- When the change is cross-cutting, run `scripts/verify.sh all` from the repo root.

## 5. Prove it before reporting done

- `scripts/verify.sh all` must pass (or only the known advisory checks may be yellow) before the work is called complete. Every required check runs even if an earlier one fails, so read the whole summary.
- Inspect the real diff: `git status --short` and `git diff`. Confirm only intended files changed and no generated file drifted unexpectedly.
- For UI changes, use the Playwright MCP to open the page, capture a screenshot, and check the console. Compare against the intended design, not just "it rendered".
- Update the graph after code changes: `graphify update .` (AST-only, no API cost).
- For a risky or cross-cutting diff, launch the `verifier` subagent for an independent read of the diff and the surrounding code before you claim success. It reports with file:line and a PASS/FAIL verdict.
- Write a build journal entry at `.opencode/journal/<timestamp>-<slug>.md` following `references/journal-template.md`. Record the exact commands and results, not a paraphrase.
- Add durable findings to memory (project facts, traps, decisions) so the next session starts ahead.

## 6. Report

- Lead with what changed and the evidence (commands and results).
- List the files touched and any check that remains red, with the exact error.
- State open questions and anything the user needs to decide.
- Leave the tree ready to ship. Commit, push, and deploys are the `kfd-ship` skill's job when the user asks to ship.
