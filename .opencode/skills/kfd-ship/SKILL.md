---
name: KFD Ship
description: Use when committing, pushing, or deploying KFD, or when the user asks to ship, release, or run CI/CD. The verified path to GitHub: production audits, the full verify gate, a conventional commit, KFD_PUSH=1 push, and the deploy commands.
---

# KFD ship

OpenCode owns commit, push, and deploys in this repo. This skill documents the verified path; it adds no permission rules and removes none. `git commit` and `KFD_PUSH=1 git push` stay available.

## Before committing or pushing

1. `git status --short` and `git diff` (and `git diff --cached` when something is staged). Confirm only intended files are in the change.
2. `cd admin && npm audit --omit=dev --audit-level=high` and `cd mobile && npm audit --omit=dev`. Read the advisory text; a critical advisory in a production dependency is the finding, not the exit code.
3. `scripts/verify.sh all` from the repo root. It mirrors CI: admin audit/lint/typecheck/test/build and mobile audit/expo-doctor/lint/typecheck/test/bundle plus the harness self-test. Required checks must pass; the mobile audit and Expo Doctor are advisory by design.
4. Confirm the commit message is conventional (commitlint enforces it).

## Commit

- Stage only the intended files. Do not sweep in unrelated working-tree changes.
- Use a conventional message that names the user-visible change, for example `fix(rider): include delivery address in the order payload`.
- If the user asked only for the change, report evidence and stop; committing is a separate, explicit step.

## Push

- Push with the marker the pre-push hook expects:

  ```sh
  KFD_PUSH=1 git push
  ```

- The hook re-runs `scripts/verify.sh all` and refuses an unmarked push. Do not set `KFD_SKIP_VERIFY=1` unless the failure is genuinely unrelated to what is being pushed and you are deliberately accepting it.
- After the push, report the branch, the commit SHA, and the CI run URL (`gh run list` / `gh run watch`). CI is `.github/workflows/ci.yml`; the aggregate check to require in branch protection is `ci-ok`.

## Deploy

Deploys are OpenCode's job and run through the same CI/CD pipeline. Use the project's own commands, not ad-hoc equivalents:

- Web/admin: the Vercel deployment tied to `main` (or `vercel --prod` when a manual deploy is intended).
- Mobile: `eas build` / `eas submit` with the profiles in `mobile/eas.json`.
- Supabase: `supabase db push` for migrations, after reviewing the migration diff.
- Workflows: `gh workflow run <name>` when a manual dispatch is intended.

Report the deployment URL or build ID when done. If a deploy fails, read the actual workflow or build log before retrying.

## Rollback

- Code: `git revert <sha>` (or `git reset` on a local branch that has not been pushed), then push through the normal gate.
- Web: promote the previous Vercel deployment.
- Mobile: submit the previous build, or ship a forward fix; EAS builds are immutable.
- Database: migrations are forward-only in this repo. Write a new corrective migration rather than editing an applied one.
