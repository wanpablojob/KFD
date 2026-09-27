-- --------------------------------------------------------------------------
-- Bootstrap the first platform admin.
--
-- 0002 tightened RLS so only rows in app_users can read data. That table
-- starts empty, which locks every existing account out of the admin
-- dashboard until one is promoted. The original admin predates this
-- migration, so promote the oldest account.
--
-- Guarded on "no admin exists yet" so this stays a one-time bootstrap and
-- can never re-promote someone later.
-- --------------------------------------------------------------------------

insert into app_users (user_id, role)
select id, 'admin'
  from auth.users
 where not exists (
         select 1 from app_users where role = 'admin'
       )
 order by created_at asc
 limit 1
on conflict (user_id) do update set role = 'admin';
