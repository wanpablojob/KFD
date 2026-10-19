# Phase C — production and store submission

The Phase C plan (26–28 Oct) is mostly a list of things a human has to do.
This is the same list with the mechanical parts made mechanical: the gate to
run first, the exact place each value goes, and the two things that fail
silently when nobody checks them — a store build with a missing key, and a
store listing that points at a preview URL.

## The gate

```bash
scripts/verify.sh all         # the code
scripts/phase-c-preflight.sh  # the launch inputs
```

Phase C starts when both are green. The preflight fails on code defects
(a missing store URL, a variable the code reads that no example file
declares) and *reports* the owner inputs that are still open without
failing, because until the owner fills them in the site hides them, which is
the correct behaviour.

## The nine items

| # | Item | Done when | Where |
|---|------|-----------|-------|
| 1 | All migrations applied to production | The migrate-db workflow ran dry, then applied, and the schema assertions passed | `.github/workflows/migrate-db.yml` |
| 2 | Backups on, one restore tested | A dump was taken, attached to the run, and restored by the rehearsal script | `scripts/restore-rehearsal.sh` |
| 3 | Admin portal live on Vercel | The production build has the production keys **and** `NEXT_PUBLIC_SITE_URL` | `deploy-admin.yml`, Vercel env |
| 4 | Every `TODO(owner)` filled | `admin/src/lib/site-content.ts` has no empty contact, hours, area or restaurant list | `site-content.ts` |
| 5 | Store listings complete | Screenshots, description, privacy URL, support URL, data safety form, privacy labels | App Store Connect, Play Console |
| 6 | Reviewer test accounts | One customer account and one rider account that a stranger can sign into | Production database |
| 7 | EAS production build submitted | Both stores have a build in review | `mobile/eas.json` |
| 8 | Pilot data seeded | Restaurants, menus, service areas exist in production, with no placeholder rows | Production database |
| 9 | Merchant accounts provisioned | Each merchant signed in once | `set_merchant_access` |

## 1. Migrations

The workflow is `workflow_dispatch` only, it is gated behind the
`production` GitHub environment, and it defaults to `max_pending: 1`.

```bash
# 1. Dry run. Prints and validates the SQL, applies nothing.
#    Workflow: Migrate Database, dry_run: true
# 2. Apply. Raises max_pending only if more than one is pending.
#    Workflow: Migrate Database, dry_run: false
```

Two things to know before the first run:

- The project ref in the workflow is production. There is no staging target
  in the workflow, on purpose: a workflow that accepts a project ref can be
  pointed at somebody else's database. Test a migration against a local
  stack (`supabase start`, then `supabase db reset`) instead.
- The dry run parses the SQL with the same parser the database uses. It
  proves the statement is valid, not that the change is safe on real data.
  That is what the backup is for.

## 2. Backups, and a restore that has been tried

The standing backups are the point-in-time recovery in the Supabase
dashboard. The workflow now also takes a dump of the `public` schema
immediately before it applies anything, and attaches it to the run as the
`pre-apply-backup` artifact. That dump is the state the migration was about
to change, which is the state a restore needs.

Rehearse the restore before you need it:

```bash
scripts/restore-rehearsal.sh <public-schema.sql> <public-data.sql>
```

It restores both files into a throwaway Postgres container, prints the row
count of every table that came back, and deletes the container. The schema
goes first: a data-only dump has no `CREATE TABLE` in it, so restoring data
into an empty database fails on the first row.

The rehearsal is the evidence for "one restore tested". It is not the
backup: the backup is the artifact the workflow attaches.

## 3. The admin portal in production

The production deploy pulls the Vercel production environment and builds with
it. The values that must exist there:

| Variable | Why it matters in production |
|----------|------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | The portal talks to the production database, not staging |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sign-in |
| `NEXT_PUBLIC_SITE_URL` | The real domain. Without it the site falls back to the Vercel preview URL, and every canonical link, the sitemap and the store listing URLs point at a preview host |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side only. Bypasses RLS; it must never be a `NEXT_PUBLIC_` variable |
| `RESEND_API_KEY`, `ORDER_EMAIL_FROM` | Order and rider emails. Without them the app says the email was not sent instead of failing silently |
| `SENTRY_DSN` | Optional. Without it, route errors are logged instead of reported |

`NEXT_PUBLIC_SITE_URL` is the root of every URL in a store listing, so set
it before the listings are written, not after.

## 4. The content the owner has to supply

Everything in `admin/src/lib/site-content.ts` marked `TODO(owner)`:

| Value | Constant | Appears on |
|-------|----------|-------------|
| Support phone, email, Messenger, hours | `CONTACT` | Support page, landing footer, privacy and terms pages |
| Delivery barangays | `DELIVERY.areas` | Support page, landing page |
| Delivery hours | `DELIVERY.hours` | Support page, landing page |
| DTI or SEC registration number | `BUSINESS.registrationNumber` | Support page, legal pages |
| Social pages | `SOCIALS` | Landing footer |
| Pilot restaurants | `PARTNER_RESTAURANTS` | Landing page |

The support channels are the ones a store reviewer will look for. An empty
list is honest and the site hides it; a support URL that says "coming soon"
is a rejection risk, because both stores require a support URL that offers
a way to contact the developer.

## 5. Store listings

### The URLs

| Listing field | URL |
|---------------|-----|
| Privacy policy | `https://<SITE_URL>/privacy` |
| Support URL | `https://<SITE_URL>/support` |
| Terms | `https://<SITE_URL>/terms` |
| Account deletion | In the app: customer *Account* → *Delete my account*; rider *Profile* → *Delete my account* |

Screenshots: Apple wants 6.7" (1290×2796) and 6.5" (1242×2688); Google
wants 1080×1920. They come from a device, so they cannot be generated from
the repo.

### The disclosure

The privacy policy is the source of truth. Both stores ask for the same
information in different words, so the answers below are the policy read
back as form fields. If the policy changes, these change with it.

| What the app holds | Apple privacy label | Google data safety |
|--------------------|---------------------|--------------------|
| Name, email, phone | Contact Info: Name, Email Address, Phone Number | Personal info: Name, Email address, Phone number |
| User id, push token | Identifiers: User ID, Device ID | App activity / device identifiers |
| Order items, total, address, ratings | User Content: Customer Support, Other User Content; Purchases: Purchase History | App activity, App interactions, Other user-generated content |
| Delivery photo, cash collected, GCash reference | User Content: Photos or Videos; Purchases: Purchase History | Photos and videos, Other financial info |
| Crash reports (id, email, role, device) | Usage Data: Crash Data | Diagnostics: Crash logs |
| Location | **Not collected.** There is no location permission in the app | Not collected |
| Tracking | **No.** No advertising ID, no tracking across apps | No, the app does not share data with third parties for tracking |

Processors to name on both forms: Supabase (database and sign-in), Vercel
(website host), Expo (push notifications), Sentry (crash reports), Resend
(order email).

Also answered on both forms: data is encrypted in transit (HTTPS), and a
user can request deletion — in the app, or through the support contact.

## 6. Reviewer accounts

A reviewer needs two accounts that work without any special hardware:

- **Customer** — sign up in the app with the reviewer's email; the
  customer role attaches to the session automatically.
- **Rider** — a rider is not self-approving. The rider applies in the app
  and an admin approves the application in `/dashboard/riders`, which is
  what creates the `riders` row. Approve one before the build is submitted,
  or the reviewer cannot open the rider half of the app.

Both accounts need the production database behind them, not staging, and
the reviewer's own email so the store team can ask for a reset.

## 7. Builds and submission

```bash
cd mobile
eas build --profile production --platform all
eas submit --profile production --platform all
```

The `production` build profile points at the EAS environment called
`production`. The variables live in EAS (dashboard → Environments), not in
a local `.env.local` — a local file is not read by a cloud build, and a
missing variable produces a bundle that boots against an undefined URL
instead of an error. The list is `mobile/.env.example`; `scripts/phase-c-preflight.sh`
checks that the code and that file agree.

The `preview` environment needs the same variables, so the preview build
in Phase A is a rehearsal of the production build.

## 8. Seeding production

Seed restaurants, menus and service areas with real, permission-cleared
data only. `site-content.ts` has the same rule for the marketing surface:
an empty list is honest, a placeholder row is not. Every merchant account
should be signed into once before launch — a merchant who has never seen
the console cannot answer a pilot-day question about it.

## Owner inputs, and where they go

| Input | Goes into | Blocks |
|-------|-----------|--------|
| Apple and Google developer accounts | — | Submission |
| Support phone or Messenger, support hours | `CONTACT` | Store listing support URL |
| DTI or SEC number | `BUSINESS.registrationNumber` | Website, store listing |
| Delivery barangays and hours | `DELIVERY` | Website, store listing |
| Pilot restaurants, menus, prices, hours | Production database | Seeding |
| Commission rate and rider pay terms | `PARTNER_TERMS` | Merchant sign-up |
| Store screenshots, app description | Listing copy | Submission |
