# KFD — Food Delivery Platform

KFD is a food-delivery platform modeled after Foodpanda, consisting of an admin web dashboard, a customer mobile app, and (planned) a backend API.

[![CI](https://github.com/wanpablojob/KFD/actions/workflows/ci.yml/badge.svg)](https://github.com/wanpablojob/KFD/actions/workflows/ci.yml)
[![Deploy Admin](https://github.com/wanpablojob/KFD/actions/workflows/deploy-admin.yml/badge.svg)](https://github.com/wanpablojob/KFD/actions/workflows/deploy-admin.yml)
[![Release Please](https://github.com/wanpablojob/KFD/actions/workflows/release-please.yml/badge.svg)](https://github.com/wanpablojob/KFD/actions/workflows/release-please.yml)

## Project structure

```
KFD/
├── admin/       # Next.js admin web application (dashboard)
├── mobile/      # React Native / Expo customer app
├── backend/     # NestJS backend API (not yet created)
├── .github/
│   ├── workflows/ci.yml
│   └── pull_request_template.md
└── README.md
```

## Requirements

- Node.js 22 (LTS)
- npm

## Development

Steps apply from the repository root.

1. **Install dependencies** (per app, using the lockfiles):

   ```sh
   cd admin && npm ci
   cd mobile && npm ci
   ```

2. **Configure environment variables**:

   Copy the example files and fill in real values locally. Never commit `.env` files.

   ```sh
   cp admin/.env.example admin/.env.local
   cp mobile/.env.example mobile/.env.local
   ```

   Public variables (`NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`) are safe for the client.
   Server-side secrets (`DATABASE_URL`, `JWT_SECRET`, `SUPABASE_*`, ...) must never
   be exposed to the browser or committed.

3. **Start the admin app** (Next.js):

   ```sh
   cd admin
   npm run dev        # http://localhost:3000
   ```

4. **Start the mobile app** (Expo):

   ```sh
   cd mobile
   npm start          # scan the QR code with Expo Go
   ```

5. **Start the backend** — not yet available. The `backend/` NestJS service will be added in a future step.

6. **Run lint**:

   ```sh
   cd admin && npm run lint
   ```

7. **Run type checking**:

   ```sh
   cd admin && npm run typecheck
   cd mobile && npm run typecheck
   ```

8. **Run tests** — no test runner/suite is configured yet. Add `test` scripts to each app
   when test suites are introduced; the CI pipeline will pick them up.

9. **Run production builds**:

   ```sh
   cd admin && npm run build
   cd mobile && npm run build   # or `npx expo export` for a web bundle
   ```

## CI/CD

All automation lives in `.github/workflows/`. Every pull request and every
push to `main` runs the pipeline below.

```
feature/* branch
      │
      ▼
Pull request ──► CI (lint / typecheck / audit / test / build)
      │              │
      │              └──► Deploy Admin → Vercel Preview (staging)
      ▼
    merge  ←  required checks pass (CI OK)
      │
      ▼
    main ──► CI ──► manual Deploy Admin → Vercel Production
              │
              ├──► Release Please opens/updates a release PR
              └──► manual Migrate Database (dry run first)
```

### Workflows

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `ci.yml` | PRs to `main`, pushes to `main` | Monorepo-aware lint, typecheck, `npm audit`, test, build. `CI OK` is the aggregate gate. |
| `deploy-admin.yml` | PRs to `main`; manual | Deploy admin to Vercel (preview for PRs; production only by manual dispatch from `main`, after `CI OK`). |
| `deploy-backend.yml` | pushes touching `backend/**`; manual | Deploy the backend to Render (dormant until `backend/` exists). |
| `migrate-db.yml` | manual | Apply Supabase migrations. Dry run by default; `max_pending` caps a batch. |
| `build-mobile.yml` | `v*` tags; manual | EAS store build. Dormant until `EXPO_TOKEN` is set. |
| `commitlint.yml` | PRs to `main` | Enforce conventional commit messages. |
| `release-please.yml` | pushes to `main` | Version bumps, changelogs, and GitHub Releases per app. |

- **Branch strategy**: `main` with short-lived `feature/*` branches.
- **Monorepo-aware**: only the apps whose files changed (plus shared config) run their checks.
- **Database**: the `db` job applies every migration to a throwaway local Supabase and runs the SQL tests in `admin/supabase/tests`; a migration that fails on a real schema cannot pass a PR.
- **Caching**: dependencies are cached via `actions/setup-node` using each app's `package-lock.json`.
- **Concurrency**: superseded runs on the same ref are cancelled automatically.
- **Tests**: test steps run with `--if-present`, so they no-op until a `test` script is added.

### Environments and secrets

| Name | Type | Used by | Notes |
| --- | --- | --- | --- |
| `staging` | Environment | Admin preview deploys | No protection rules. |
| `production` | Environment | Admin deploys | Manual dispatch gate; required reviewers need GitHub Pro. |
| `VERCEL_TOKEN` | Secret | `deploy-admin.yml` | Vercel account token. |
| `VERCEL_ORG_ID` | Secret | `deploy-admin.yml` | Vercel team/user id. |
| `VERCEL_PROJECT_ID` | Secret | `deploy-admin.yml` | Vercel project id (root directory `admin`). |
| `NEXT_PUBLIC_SUPABASE_URL` | Secret | `deploy-admin.yml`, `ci.yml` | Supabase → Settings → API → Project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Secret | `deploy-admin.yml`, `ci.yml` | Supabase → Settings → API Keys → Publishable key. |
| `SUPABASE_ACCESS_TOKEN` | Secret | `migrate-db.yml` | Supabase → Account → Access Tokens. |
| `SUPABASE_DB_PASSWORD` | Secret | `migrate-db.yml` | Supabase → Settings → Database → Database password. |
| `EXPO_TOKEN` | Secret | `build-mobile.yml` | Expo → Account Settings → Access Tokens. |
| `EAS_PROJECT_ID` | Variable | `build-mobile.yml` | `expo.extra.eas.projectId` (also in `mobile/.env.local`). |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Secret | `verify-admin-ui.yml` | Dedicated admin account in Supabase Auth, role `admin`. |
| `RENDER_DEPLOY_HOOK_URL` | Secret | `deploy-backend.yml` | Render deploy hook (added when the backend exists). |
| `BACKEND_URL` | Variable | `deploy-backend.yml` | Public backend URL, shown in the GitHub UI. |

Vercel Production also needs its own server-side variables (set them in the
Vercel project, not GitHub): `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
`ORDER_EMAIL_FROM`, `NEXT_PUBLIC_SITE_URL`, and optionally `SENTRY_DSN`. The
mobile build reads `EXPO_PUBLIC_*` from the EAS environment named in
`mobile/eas.json` (production or preview), not from GitHub.

### Branch protection

Native branch protection, repository rulesets, and environment required
reviewers are **not available on this repository's current plan**: it is a
private repo on GitHub Free, and the API returns 403/422 for those features
(checked 2026-10-20). The free equivalents in place are:

- `CI OK` is the single required check by convention. CI runs on every PR and
  on every push to `main`; the `db` job also applies every migration to a
  throwaway database and runs the SQL tests.
- The pre-push hook refuses an unmarked push (`KFD_PUSH=1`), runs
  `scripts/verify.sh all`, and refuses force-pushes or deletions of `main` and
  rewrites of `v*` release tags.
- Dependabot alerts and security updates are enabled.
- The default `GITHUB_TOKEN` is read-only; each workflow opts in explicitly.
- Production admin deploys are manual dispatches from `main`, require
  `confirm_production=deploy`, and refuse to run unless `CI OK` is green.
- Database migrations are manual, dry-run by default, and capped by
  `max_pending`.

If the repository is upgraded to GitHub Pro (or made public), the native rules
can be applied with:

```sh
gh api -X PUT repos/wanpablojob/KFD/branches/main/protection \
  -f required_status_checks.strict=true \
  -f required_status_checks.contexts[]='CI OK' \
  -f enforce_admins=false \
  -f required_pull_request_reviews.required_approving_review_count=1 \
  -f restrictions=

uid=$(gh api users/wanpablojob --jq .id)
gh api -X PUT repos/wanpablojob/KFD/environments/production --input - <<JSON
{"reviewers":[{"type":"User","id":$uid}],"prevent_self_review":false}
JSON
```

> Require `CI OK` and `Lint commit messages`; add Release Please once it has
> run. Release Please requires `Settings → Actions → General → Workflow
> permissions → Allow GitHub Actions to create and approve pull requests`.

### Commit style

Keep commits small and conventional:

```
feat: add restaurant dashboard
fix: correct order status
refactor: reorganize rider components
docs: update README
test: add order service tests
chore: bump dependencies
ci: add GitHub Actions pipeline
```

## Deployment

### Admin → Vercel

The admin Next.js app deploys via GitHub Actions (`.github/workflows/deploy-admin.yml`).
Two environments are supported:

- **Preview / Staging**: on every pull request, a Vercel Preview is deployed
  to the `staging` GitHub Environment. The preview URL is commented on the PR.
- **Production**: a manual `workflow_dispatch` from `main` with
  `target=production` and `confirm_production=deploy`. The job refuses to run
  unless `CI OK` is green for that exact commit. `admin/vercel.json` sets
  `git.deploymentEnabled` to `false`: Vercel's Git integration creates no
  deployments at all, so the workflow is the only deploy path. This keeps
  production from being aliased by a push and stops duplicate preview builds
  that lack the project's environment variables.

Required secrets (add in `Settings → Secrets and variables → Actions`):

- `VERCEL_TOKEN` – Vercel account token.
- `VERCEL_ORG_ID` – Vercel organization or user id.
- `VERCEL_PROJECT_ID` – Vercel project id (root directory must be `admin`).

Error reporting: set `SENTRY_DSN` in the Vercel project's environment
variables to report API-route errors (push, dispatch, order notifications) to
Sentry. Without it nothing is sent.

See `.github/workflows/deploy-admin.yml` for the deployment steps, or run
`npm run build` locally and then `vercel deploy` manually.

### Mobile → EAS

The mobile app builds with EAS (`mobile/eas.json`):

- `eas build --profile preview` – an internal build for testers (an Android APK
  and an ad-hoc iOS build).
- `eas build --profile production` then `eas submit` – store builds; the build
  number is kept by EAS and increases on every production build.

Each profile reads its variables from the matching EAS environment (`preview`,
`production`). Set these four there; all are public and embedded in the app:
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_EAS_PROJECT_ID`. Submitting needs the Apple
and Google developer accounts linked in EAS.

### Backend → Render (planned)

When the `backend/` NestJS service is created, it will be deployed from
`backend/` as the root directory via a deploy hook. Until then, the
`deploy-backend.yml` workflow remains dormant.

### Release Please

On push to `main`, `Release Please` opens or updates a pull request that
bumps the per‑app version (`admin`, `mobile`) and regenerates the
corresponding `CHANGELOG.md`. Merging that PR creates a GitHub Release and
tags the release. See `.github/workflows/release-please.yml` and the config
files at the repo root.

## Security

- Never commit secrets or `.env` files.
- Server-side secrets stay out of the browser/client bundles.
- Required GitHub Secrets for CI/CD are added in the repository settings when
  a job needs them.
- **Branch rules**: native branch protection is unavailable on the free
  private plan; see "Branch protection" above for the free equivalents and the
  command to apply once the plan supports it.