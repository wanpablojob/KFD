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
    main ──► CI ──► Deploy Admin → Vercel Production (approval required)
              │
              └──► Release Please opens/updates a release PR
```

### Workflows

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `ci.yml` | PRs to `main`, pushes to `main` | Monorepo-aware lint, typecheck, `npm audit`, test, build. `CI OK` is the aggregate gate. |
| `deploy-admin.yml` | PRs to `main`; successful `CI` on `main`; manual | Deploy admin to Vercel (preview for PRs, production for `main`). |
| `deploy-backend.yml` | pushes touching `backend/**`; manual | Deploy the backend to Render (dormant until `backend/` exists). |
| `commitlint.yml` | PRs to `main` | Enforce conventional commit messages. |
| `release-please.yml` | pushes to `main` | Version bumps, changelogs, and GitHub Releases per app. |

- **Branch strategy**: `main` with short-lived `feature/*` branches.
- **Monorepo-aware**: only the apps whose files changed (plus shared config) run their checks.
- **Caching**: dependencies are cached via `actions/setup-node` using each app's `package-lock.json`.
- **Concurrency**: superseded runs on the same ref are cancelled automatically.
- **Tests**: test steps run with `--if-present`, so they no-op until a `test` script is added.

### Environments and secrets

| Name | Type | Used by | Notes |
| --- | --- | --- | --- |
| `staging` | Environment | Admin preview deploys | No protection rules. |
| `production` | Environment | Admin + backend deploys | Add **required reviewers** to gate production. |
| `VERCEL_TOKEN` | Secret | `deploy-admin.yml` | Vercel account token. |
| `VERCEL_ORG_ID` | Secret | `deploy-admin.yml` | Vercel team/user id. |
| `VERCEL_PROJECT_ID` | Secret | `deploy-admin.yml` | Vercel project id (root directory `admin`). |
| `RENDER_DEPLOY_HOOK_URL` | Secret | `deploy-backend.yml` | Render deploy hook (added when the backend exists). |
| `BACKEND_URL` | Variable | `deploy-backend.yml` | Public backend URL, shown in the GitHub UI. |

### Branch protection

Require the **CI OK** status check (plus **Lint commit messages** and, once
configured, Release Please) before merging to `main`. With the GitHub CLI:

```sh
gh api -X PUT repos/wanpablojob/KFD/branches/main/protection \
  -f required_status_checks.strict=true \
  -f required_status_checks.contexts[]='CI OK' \
  -f enforce_admins=false \
  -f required_pull_request_reviews.required_approving_review_count=1 \
  -f restrictions=
```

> Release Please requires `Settings → Actions → General → Workflow
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
- **Production**: on every successful `CI` run on `main` that touches `admin/`,
  the admin is deployed to the `production` GitHub Environment. A
  required-reviewer approval gate can be configured in the GitHub UI.

Required secrets (add in `Settings → Secrets and variables → Actions`):

- `VERCEL_TOKEN` – Vercel account token.
- `VERCEL_ORG_ID` – Vercel organization or user id.
- `VERCEL_PROJECT_ID` – Vercel project id (root directory must be `admin`).

See `.github/workflows/deploy-admin.yml` for the deployment steps, or run
`npm run build` locally and then `vercel deploy` manually.

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
- **Branch protection**: require the **CI OK** status check (plus **Lint
  commit messages** and, once configured, **Release Please**) before merging to
  `main`. See the "Branch protection" subsection above.