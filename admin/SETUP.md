# Manual setup checklist

Everything here needs a dashboard or an account only you control. Nothing in
this file can be automated from the repo, and none of it is done yet.

Ordered so each step unblocks the next. Steps 1 and 2 are the only blockers
on the merchant portal going live.

---

## 1. Fix the Vercel deploy  (blocking)

Every deploy has failed since the merchant work landed, at `vercel pull`,
before the code is even built. Pinning the CLI did not fix it, so this is the
credential.

1. Vercel → Account Settings → Tokens → Revoke the old `VERCEL_TOKEN`, then
   create a new one. Check the scope box for the team that owns
   `kfd-one`, not just your personal account.
2. Set it without pasting it into chat:

   ```sh
   gh secret set VERCEL_TOKEN --repo wanpablojob/KFD
   ```

3. Check the two project settings already exist and match the live project:

   ```sh
   gh secret list --repo wanpablojob/KFD
   ```

   `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and `VERCEL_TOKEN` are all required.

4. Tell me and I will redeploy and confirm `/merchant` returns 200.

**If it still fails**, run this locally and paste the output (not the token):

```sh
npx vercel@60.0.1 pull --yes --scope=<your-team-slug>
```

---

## 2. Add the email keys

The portal works without these, but accept/reject will report "saved, but the
customer email was not sent".

1. Supabase → Project Settings → API → **service_role** → copy it. It starts
   with `sb_secret_`. This key bypasses RLS: treat it like a password and
   never let it reach the browser.
2. Resend → API Keys → Create API key. It starts with `re_`.
3. Resend → Domains → Add Domain, then add the DNS records Resend gives you
   at your DNS host. Wait for the green tick. Until a domain verifies, the
   only address that works is Resend's `onboarding@resend.dev`, and that can
   only send to your own inbox.
4. Set all three:

   ```sh
   gh secret set SUPABASE_SERVICE_ROLE_KEY --repo wanpablojob/KFD
   gh secret set RESEND_API_KEY --repo wanpablojob/KFD
   gh secret set ORDER_EMAIL_FROM --repo wanpablojob/KFD
   ```

   `ORDER_EMAIL_FROM` is a string like `KFD <orders@your-domain.com>` and
   must match a domain you verified in step 3.
5. For local development add the same three to `admin/.env.local`, which is
   gitignored.

---

## 3. Confirm your admin login  (do this soon)

Tightening the RLS policies meant every account needed a row in `app_users`.
Migration `0003` promotes your **oldest** account to admin automatically. I
have never been able to test this, because I do not have your password.

Sign in at `/login`. If you land on the admin console, it worked. If you get
"This account is not linked to an admin or a restaurant yet", the bootstrap
picked the wrong account and you need to fix it:

```sql
-- run in Supabase → SQL Editor
update app_users
set role = 'admin', restaurant_id = null
where user_id = (
  select id from auth.users where email = 'your-email@example.com'
);
```

If that account has no row at all, insert one:

```sql
insert into app_users (user_id, role)
values (
  (select id from auth.users where email = 'your-email@example.com'),
  'admin'
);
```

---

## 4. Turn on real accounts for merchants

There is no admin screen for this yet. Today a merchant is a row you write by
hand, which is fine for a test account and not fine for a real business.

Per merchant, two steps in Supabase → Authentication → Users → Add user:

1. Create the user with their email and a temporary password. **Tick "Auto
   Confirm User"**, otherwise they cannot sign in.
2. Then run this, once per merchant:

```sql
insert into app_users (user_id, role, restaurant_id)
values (
  (select id from auth.users where email = 'the-merchant@example.com'),
  'merchant',
  'rst_05'   -- restaurant id, from the restaurants table
);
```

Send them to `/login`. The same page serves both roles and routes them by
what is in `app_users`, so there is nothing else to configure.

---

## 5. Harden Supabase Auth

Worth ten minutes in Supabase → Authentication → Sign In / Providers, and
→ Auth → Rate Limits. Defaults are loose.

| Setting | Suggested | Why |
| --- | --- | --- |
| Minimum password length | 8 or more | Supabase's default is 6 |
| Password strength | on | Blocks `password123`-style choices |
| Email confirmations | on for new accounts | Confirms the address is real |
| Rate limit on `token` endpoint | on, default | Blunts password guessing |

The rate limit is worth understanding: this app's login form posts straight
from the browser to Supabase, not through a Next.js route, so there is
nothing in this repo to rate limit. Locking attempts has to happen at Supabase
or at your CDN. That is also why I did not add an in-memory limiter here, it
would look like protection while doing nothing across Vercel's instances.

---

## 6. Optional: brute-force protection at the edge

If you want a layer in front of both the app and Supabase, Cloudflare in front
of the domain gives you rate limiting and a WAF ruleset. Only worth setting up
once step 1 works, since it adds a hop to debug.

---

## 7. Allow Release Please to open its PRs

Release Please fails every run with "GitHub Actions is not permitted to create
or approve pull requests".

Settings → Actions → General → Workflow permissions → **Allow GitHub Actions
to create and approve pull requests**. This is a repository setting, which is
why it cannot be fixed from a workflow file.

---

## 8. Remove the test scaffolding before real data

Two temporary things exist in the repo and in your database. Neither is
harmful, but both should go before this holds anyone's real business.

1. Delete the test merchant from Supabase → Authentication → Users:
   `kfdtest.merchant@kfd.ph`. Migration `0005` already removed its
   `app_users` row, so it can see nothing.
2. Migration `0006_dev_merchant_login.sql` exists purely to make that test
   account usable. Drop the row it inserted:

   ```sql
   delete from app_users
   where user_id in (
     select id from auth.users where email = 'kfdtest.merchant@kfd.ph'
   );
   ```

   Then delete the `0006` file, or replace it with a real provisioning
   migration.

---

## Where the security boundary actually sits

Worth knowing before you change anything, because it is easy to weaken it by
accident:

- **Row Level Security is the real control.** Every merchant read and write is
  scoped in the database by `app_users.restaurant_id`. The browser code does
  not filter by restaurant, on purpose: a client-side filter hides nothing
  from the database, and a bug in it would silently widen what a merchant sees.
- **The route gates are convenience, not security.** `/` and `/merchant` check
  the role so the right screen appears. If a gate were deleted, RLS would
  still return no rows.
- **The notify route re-checks ownership explicitly**, because it reads orders
  with the service role, which bypasses RLS. That check is the only thing
  stopping one merchant from emailing another restaurant's customers.
