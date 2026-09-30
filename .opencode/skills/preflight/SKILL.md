---
name: preflight
description: Use before debugging "no data" / empty screens / broken backend, and before shipping anything touching schema, migrations, RPCs, or Supabase. Checks auth-vs-anon, migration drift, and CI/prod divergence first so the investigation starts from facts. Triggers on "no data", "empty", "nothing shows", "database is broken", adding or changing a migration, or any Supabase/RLS/auth work.
---

# Preflight

This repo's most expensive recurring mistake is investigating the wrong system.
Supabase **is reachable** while tables **do not match your migrations**, and a
working database still yields a blank UI. Run these checks first and state the
results before forming a hypothesis.

## A. When data is missing or empty

Never conclude "the database is broken" from a client error alone. Establish
which of these four it is — they look identical in the UI and have opposite
causes:

| Signal | Meaning |
|---|---|
| `404 PGRST125` / `PGRST205` | Wrong table, RPC, or path. A rename or bad identifier. |
| `401` / `42501` with a grant hint | Correct identifier, insufficient privilege. Expected for anon under RLS. |
| `200 []` | Reachable, visible, genuinely zero rows. |
| `400 42703` | Column does not exist — often a wrong column in a probe, not a broken schema. |

Then answer these before theorizing:

1. **Am I authenticated?** `.env.local` holds only `NEXT_PUBLIC_SUPABASE_URL`
   and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. There is no service-role key, so
   direct REST probes are **anon**, and RLS hides `orders` and other tables from
   them. An anon `[]` proves the table exists and is visible; it does not
   prove your data is missing.
2. **Does the UI actually fail, or does it render empty?** Read the error text
   in `admin/src/app/dashboard/page.tsx` — it surfaces the first error from
   `fetchOrders` / `fetchRestaurants` / `fetchRiders`.
3. **Is the session present and mapped?** A valid JWT is not a valid user row.
   Confirm `auth.uid()` resolves against `app_users.user_id` and the role is
   `admin`. See `admin/src/lib/role.ts`.
4. **Is the query correct?** For `2e58e12` the client, auth, and database were
   all fine; the code asked for `/dashboard/orders`. Check the table names in
   `queries.ts` before blaming the backend.

A cheap reachability probe (anon, read-only, no secrets beyond the public key):

```bash
URL=$(grep NEXT_PUBLIC_SUPABASE_URL admin/.env.local | cut -d= -f2-)
KEY=$(grep NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY admin/.env.local | cut -d= -f2-)
curl -s -o /dev/null -w "%{http_code}\n" -H "apikey: $KEY" \
  -H "Authorization: Bearer $KEY" "$URL/rest/v1/<table>?select=*&limit=1"
```

## B. Before shipping schema / migration / RPC work

Migrations here have drifted from production more than once. This is the
recurring trap, so check it every time.

- **Repo has 32 migrations; production applies far fewer.** `0024`–`0032`
  exist in `admin/supabase/migrations/` but are not recorded as applied in
  Supabase. Do **not** mark `0024`–`0030` applied without verifying their DDL
  actually ran.
- **Ask the real database, not the migration folder:**
  `supabase gen types typescript --project-id <ref>` reflects live state. Compare
  its table and function list against the code's assumptions. When I generated
  it, `leads` and `submit_lead` were **absent**, which independently confirmed
  `0032` was unapplied.
- **Code ahead of schema fails at runtime, not at build.** `0032` gates all lead
  submissions; `0031` fixes production `23502 null value in column "id"` from
  `customer_place_order()`. If a migration is committed but unapplied, say so
  plainly when reporting status.
- `.github/workflows/migrate-db.yml` is `workflow_dispatch` only and has been
  unreliable. Do not assume CI applied anything.
- The migration history is inconsistent; repair it deliberately, never by
  marking files applied on faith.

## C. Before claiming anything works

- CI runs with **placeholder** `EXPO_PUBLIC_SUPABASE_*` and no real database, so
  a green CI run says nothing about Supabase correctness.
- Local `npm test` passing says nothing about production RLS or auth.
- Required gate before commit: `npm run typecheck && npm run lint && npm test`
  in `admin/`. Add `npm run build` for anything touching routes or metadata.
- After push, confirm CI, Deploy Admin, and the Vercel production deployment
  all report success, and report the deployed SHA.

## D. Working rules for this repo

- Update `graphify-out/` with `graphify update .` after changing code. Dirty
  graph files are expected and not a reason to skip it.
- Never invent product content: restaurants, contact details, delivery areas,
  pricing policy, commission rates, or a business registration number. Keep
  `TODO(owner)` placeholders in `admin/src/lib/site-content.ts` until the owner
  supplies real values.
- Never commit secrets. `.env.local` stays untracked; the Supabase access token
  lives in `~/.supabase/access-token`.
