# KFD — Food Delivery Platform

KFD is a food-delivery platform modeled after Foodpanda, consisting of an admin web dashboard, a customer mobile app, and (planned) a backend API.

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

Every pull request and every push to `main` is checked by GitHub Actions
(`.github/workflows/ci.yml`).

```
feature/* branch
      │
      ▼
Pull request → GitHub Actions
      │            │
      │    lint / typecheck / build
      │            │
      ▼            ▼
    merge  ←  all checks pass
      │
      ▼
    main → deployment
```

- **Branch strategy**: `main` with short-lived `feature/*` branches.
- **Monorepo-aware**: only the apps whose files changed (plus shared config) run their checks.
- **Caching**: dependencies are cached via `actions/setup-node` using each app's `package-lock.json`.

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

The Next.js app deploys from `admin/` as the root directory. In the Vercel project
settings, set **Root Directory** to `admin` and add environment variables from
`admin/.env.example`. Next.js is auto-detected; no extra config file is required.

### Backend → Render (planned)

When the `backend/` NestJS service is created, it will be deployed from `backend/`
as the root directory. No deployment runs until that app exists.

### Database → Supabase PostgreSQL (planned)

Connection details will be provided via environment variables. Never commit
`DATABASE_URL` or `SUPABASE_*` keys.

## Security

- Never commit secrets or `.env` files.
- Server-side secrets stay out of the browser/client bundles.
- Required GitHub Secrets for CI/CD are added in the repository settings when a job needs them.