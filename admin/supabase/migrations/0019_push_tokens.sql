-- --------------------------------------------------------------------------
-- Push tokens for Expo Push (Prompt 6.2)
--
-- One row per registered device. The id is the Expo push token itself -- Email
-- tokens are unique per install, and the server upserts on it, so a device
-- re-registering (after an app reinstall or a token rotation) overwrites its
-- own row instead of duplicating.
--
-- The table is deliberately write-free from the client. Tokens are stored
-- server-side only (Prompt 6.2), via a Next.js route that holds the service
-- role key. No client insert policy exists, so a leaked anon key cannot
-- fabricate a registration for someone else's device.
-- --------------------------------------------------------------------------

create table if not exists push_tokens (
  id text primary key,
  user_id uuid not null
    references auth.users (id) on delete cascade,
  token text not null unique,
  platform text not null,
  created_at timestamptz not null default now()
);

-- A deleted auth user must not leave orphan tokens that keep receiving pushes.
-- The FK above cascades, and this index backs both the user-scoped policies
-- and the lookup the send path runs per restaurant.
create index if not exists push_tokens_user_id_idx on push_tokens (user_id);

alter table push_tokens enable row level security;

-- --------------------------------------------------------------------------
-- RLS: users manage only their own device registrations.
--
-- select/delete are user-scoped so the app can show "push on/off" and revoke
-- its own token on sign-out. No update policy: a token changing means a new
-- insert from the server, and an UPDATE policy is a door any authenticated
-- caller walks through (0015's rule).
-- --------------------------------------------------------------------------

drop policy if exists "push_tokens read own" on push_tokens;
create policy "push_tokens read own"
  on push_tokens for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "push_tokens delete own" on push_tokens;
create policy "push_tokens delete own"
  on push_tokens for delete
  to authenticated
  using (user_id = auth.uid());

-- Admins may read the whole table so the console can one day show which
-- devices are registered. Write stays server-only.
drop policy if exists "push_tokens read all admins" on push_tokens;
create policy "push_tokens read all admins"
  on push_tokens for select
  to authenticated
  using (public.is_platform_admin());

-- --------------------------------------------------------------------------
-- Default table grants. Supabase's default privileges grant ALL to anon,
-- authenticated, and service_role on every new table. RLS would block most of
-- that, but make the intent explicit: the service role (server route) owns
-- writes; anon has nothing; authenticated has only what the policies grant.
-- --------------------------------------------------------------------------

revoke all on table push_tokens from anon;
revoke all on table push_tokens from public;

grant select on table push_tokens to authenticated;
grant delete on table push_tokens to authenticated;

-- service_role bypasses RLS, so it needs real schema privileges to insert.
grant select, insert, update, delete on table push_tokens to service_role;