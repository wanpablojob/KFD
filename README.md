# KFD — Food Delivery Platform

KFD is a food-delivery platform modeled after Foodpanda, built for Kabankalan City. It is one product with four surfaces sharing a single Postgres backend:

- **Customer app** (Expo) — browse restaurants, multi-shop baskets, checkout, live order tracking, Pabakal (a shopping-by-message assistant), saved addresses, order history and reordering.
- **Rider app** (Expo) — job offers, live trip list, delivery proof, GCash collection, earnings.
- **Merchant console** (Next.js) — incoming orders, menu and availability, payouts, settlement.
- **Admin portal** (Next.js) — dispatch, riders, customers, restaurants, service areas, disputes, audit log.

[![CI](https://github.com/wanpablojob/KFD/actions/workflows/ci.yml/badge.svg)](https://github.com/wanpablojob/KFD/actions/workflows/ci.yml)
[![Deploy Admin](https://github.com/wanpablojob/KFD/actions/workflows/deploy-admin.yml/badge.svg)](https://github.com/wanpablojob/KFD/actions/workflows/deploy-admin.yml)
[![Release Please](https://github.com/wanpablojob/KFD/actions/workflows/release-please.yml/badge.svg)](https://github.com/wanpablojob/KFD/actions/workflows/release-please.yml)

## Project structure

```
KFD/
├── admin/                     # Next.js: admin portal, merchant console, public site
│   └── supabase/migrations/   # 117 SQL migrations — the schema's source of truth
├── mobile/                    # Expo SDK 57: customer app, rider app, merchant app
│   └── src/app/{customer,rider,merchant,auth}/
├── scripts/                   # verify.sh (the gate), preflight, restore rehearsal
├── docs/                      # launch runbook
├── .github/workflows/         # CI, deploy, migrate, release
├── HARNESS.md                 # the two-agent build/verify split
└── README.md
```

There is no separate backend service. The backend is Postgres plus SQL:
row-level security, RPCs and triggers in Supabase do the work a REST tier
would otherwise do, and the clients call it directly.

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

   The mobile app is pinned to **Expo SDK 57**. `npx expo` resolves to the
   SDK 57 CLI from any directory in the repo (the root `package.json` pins
   `expo` for that reason), so avoid running it outside the project tree with an
   unpinned global install.

5. **Run tests and the full gate**. One command runs everything CI runs —
   lint, typecheck, tests, both builds, the Android bundle, migrations and the
   launch preflight:

   ```sh
   scripts/verify.sh            # everything
   scripts/verify.sh admin      # one app
   scripts/verify.sh mobile
   ```

   Per-app, for a faster loop:

   ```sh
   cd admin  && npm run lint && npm run typecheck && npm run test   # 308 tests
   cd mobile && npm run lint && npm run typecheck && npm run test   # 472 tests
   ```

6. **Run production builds**:

   ```sh
   cd admin && npm run build
   cd mobile && npx expo export --platform android
   ```

   A clean `tsc --noEmit` is not proof the app bundles: the bundle is checked
   separately in the gate because a dependency can type fine and still fail to
   resolve at build time.

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
| `deploy-backend.yml` | manual | Dormant. Kept for a future service; there is no `backend/` directory today. |
| `migrate-db.yml` | manual | Apply Supabase migrations. Dry run by default; `max_pending` caps a batch. |
| `build-mobile.yml` | `v*` tags; manual | EAS store build. Dormant until `EXPO_TOKEN` is set. |
| `provision-review-accounts.yml` | manual | Create the customer and rider accounts a store reviewer signs into. |
| `commitlint.yml` | PRs to `main` | Enforce conventional commit messages. |
| `release-please.yml` | pushes to `main` | Version bumps, changelogs, and GitHub Releases per app. |
| `configure-auth.yml` | manual (dry run by default) | Apply Supabase Auth settings — providers, redirect URLs, templates. |
| `configure-production-env.yml` | manual (dry run by default) | Report or apply the Vercel production environment variables. |
| `verify-admin-ui.yml` | manual | Smoke-test the deployed admin UI against a base URL. |
| `vercel-status.yml` | manual | Read Vercel deployment status for a commit. |

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

### Backend → Supabase

There is no separate backend service to deploy. The backend is the Supabase
project: Postgres with row-level security, RPCs and triggers.

```sh
# schema changes: dry run first, then apply
#   Workflow: Migrate Database (workflow_dispatch, dry_run: true)
#   Workflow: Migrate Database (workflow_dispatch, dry_run: false)
```

Migrations live in `admin/supabase/migrations/` and are the source of truth.
The deploy workflow is gated behind the `production` GitHub environment and
attaches a pre-apply dump to each run. Rehearse a restore with
`scripts/restore-rehearsal.sh` before you need one.

`deploy-backend.yml` is dormant and stays that way unless a real service is
added.

### Release Please

On push to `main`, `Release Please` opens or updates a pull request that
bumps the per‑app version (`admin`, `mobile`) and regenerates the
corresponding `CHANGELOG.md`. Merging that PR creates a GitHub Release and
tags the release. See `.github/workflows/release-please.yml` and the config
files at the repo root.

## Security

**Access control is in the database, not the client.** Row-level security is
enabled on every table in `public` (28 of them). The patterns:

- A customer reads their own orders, a rider their assigned ones, a merchant
  only their own restaurant's rows, an admin everything.
- Policies call `(select auth.uid())` rather than `auth.uid()` so Postgres
  computes the value once per query instead of once per row (`0113`).
- Storage buckets are scoped the same way: delivery proofs are readable by the
  assigned rider and admins — deliberately **not** customers — and a Pabakal
  receipt only by the customer it belongs to.
- The service-role key is server-side only and is never a `NEXT_PUBLIC_`
  variable. `scripts/phase-c-preflight.sh` fails if that changes.

**Writes are guarded server-side**, so a modified client cannot talk its way
past them: checkout is idempotent via a cart-fingerprint request id, cancel and
rider-claim take row locks so they cannot race, and status transitions are
enforced by a trigger rather than trusted from the app.

**Post-login redirects** go through `admin/src/lib/safe-next.ts`, which rejects
protocol-relative URLs, backslashes and control characters, then re-resolves
the path against a fixed base to confirm the origin survives.

**External calls are bounded.** Gemini gets a 9s timeout with a three-model
fallback chain; Resend gets 8s. Notification routes are rate-limited per
verified user id.

- Never commit secrets or `.env` files.
- Server-side secrets stay out of the browser/client bundles.
- Required GitHub Secrets for CI/CD are added in the repository settings when
  a job needs them.
- **Build/verify split**: `HARNESS.md` describes why the agent that writes code
  is not the agent that pushes it, and the three layers that enforce it.
- **Branch rules**: native branch protection is unavailable on the free
  private plan; see "Branch protection" above for the free equivalents and the
  command to apply once the plan supports it.