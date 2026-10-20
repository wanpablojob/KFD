-- --------------------------------------------------------------------------
-- Notifications inbox
--
-- A push lives only in the phone's notification shade: once swiped away it is
-- gone, and a user with alerts off never sees it at all. This keeps a copy of
-- every alert per user, so the app can show a bell with an unread count and a
-- list, like any social app.
--
-- Rows are written only by the server (the push helpers, with the service
-- role) at the moment an alert is sent, whether or not the user has a device
-- registered. A user reads their own rows and may set read_at on them; there
-- is no client INSERT or DELETE, so nobody can fabricate an alert.
-- --------------------------------------------------------------------------

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  -- The same payload the push carried, so a tap routes exactly like a push tap.
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

comment on table public.notifications is
  'Per-user copy of every alert sent (0087). Server-written; users read their own and mark them read.';

alter table public.notifications enable row level security;

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "users mark own notifications read" on public.notifications;
create policy "users mark own notifications read"
  on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Read, and change read_at only. Nothing else, for anyone.
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;
