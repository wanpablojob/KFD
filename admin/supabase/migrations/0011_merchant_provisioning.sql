-- --------------------------------------------------------------------------
-- Merchant provisioning (Prompt 3.3)
--
-- The admin needs to attach an existing auth account to a restaurant, move one
-- between restaurants, and remove access. None of that can be done from the
-- browser as things stand:
--
--   * auth.users is not exposed to the anon or authenticated roles through
--     PostgREST. There is no way to turn an email address into a user_id
--     client-side, and no way to show an operator which email a given
--     app_users row belongs to. Both need SQL.
--   * This page deliberately does not create accounts. Provisioning a login is
--     a Supabase Auth operation, and a half-created account (auth user, no
--     app_users row) signs in to nothing at all.
--
-- The three functions below are the only writer of app_users, and they are
-- SECURITY DEFINER, which means they bypass RLS. So each one re-checks
-- is_platform_admin() itself. Trusting the caller would be the whole bug: the
-- grant is to `authenticated`, which includes every merchant. This mirrors
-- 0002, which revokes from public and grants to authenticated for the same
-- reason.
--
-- Side effect worth noting: this also removes the direct-write path. The
-- "admins manage app_users" FOR ALL policy let an admin write any role
-- directly, bypassing the checks below. Nothing in the app wrote app_users
-- that way -- the notify route only reads it -- so replacing it with a
-- read-only policy costs nothing and makes "never silently demote an admin"
-- and "never attach to an archived restaurant" true rather than aspirational.
-- --------------------------------------------------------------------------

-- Resolve a merchant's email for display. The join to auth.users is the
-- reason this exists: app_users stores no address, so without it the table
-- would show nothing but uuids.
create or replace function public.merchant_access_list()
returns table (
  user_id uuid,
  email text,
  role app_role,
  restaurant_id text,
  restaurant_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.user_id,
    coalesce(u.email, '(no email)') as email,
    a.role,
    a.restaurant_id,
    r.name as restaurant_name,
    a.created_at
  from app_users a
  left join auth.users u on u.id = a.user_id
  left join restaurants r on r.id = a.restaurant_id
  where public.is_platform_admin()
  order by a.role asc, coalesce(u.email, '') asc;
$$;

comment on function public.merchant_access_list()
  is 'Every provisioned account, with the auth email and restaurant name. Empty for a non-admin.';

-- Attach an account to a restaurant, or move it to a different one.
--
-- `on conflict do update` rather than a delete-then-insert: the
-- app_users_merchant_needs_restaurant check constraint means a merchant row
-- can never exist without a restaurant, so a two-step reassignment would have
-- to go through admin or fail.
create or replace function public.set_merchant_access(
  p_email text,
  p_restaurant_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role app_role;
  v_archived_at timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform admin can change merchant access.'
      using errcode = '42501';
  end if;

  if p_restaurant_id is null or btrim(p_restaurant_id) = '' then
    raise exception 'Choose a restaurant.';
  end if;

  if p_email is null or btrim(p_email) = '' then
    raise exception 'Enter the email address of an existing account.';
  end if;

  -- The restaurant check has to happen here, not in the UI. A client-side
  -- filter is a convenience; this is the rule.
  if not exists (select 1 from restaurants r where r.id = p_restaurant_id) then
    raise exception 'No restaurant with id % exists.', p_restaurant_id;
  end if;

  select r.archived_at into v_archived_at
    from restaurants r where r.id = p_restaurant_id;

  if v_archived_at is not null then
    raise exception 'That restaurant is archived. Restore it before attaching a merchant.';
  end if;

  select u.id into v_user_id
    from auth.users u
   where lower(u.email) = lower(btrim(p_email));

  if v_user_id is null then
    raise exception
      'No account exists for %. Create the account in Supabase Auth first -- this page does not create accounts.',
      btrim(p_email);
  end if;

  -- Guard against the worst plausible mistake: an admin types a colleague's
  -- address, that colleague is an admin, and the upsert below quietly
  -- downgrades a platform admin into a merchant of one restaurant. They would
  -- lose the console rather than being told, which is the sort of lockout that
  -- takes an incident to notice.
  select a.role into v_role from app_users a where a.user_id = v_user_id;

  if v_role = 'admin' then
    raise exception 'That account is a platform admin, so it is not attached to a restaurant.';
  end if;

  insert into app_users (user_id, role, restaurant_id)
  values (v_user_id, 'merchant', p_restaurant_id)
  on conflict (user_id) do update
    set role = 'merchant',
        restaurant_id = p_restaurant_id;

  return v_user_id;
end;
$$;

comment on function public.set_merchant_access(text, text)
  is 'Attach or move an existing auth account to a restaurant. Admin only.';

-- Remove merchant access. The auth account itself is left alone: deleting it is
-- a Supabase Auth operation, and doing it here would destroy the audit trail
-- (app_users rows cascade away with it) along with anything that account owns.
create or replace function public.revoke_merchant_access(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform admin can change merchant access.'
      using errcode = '42501';
  end if;

  if p_email is null or btrim(p_email) = '' then
    raise exception 'Enter the email address of an existing account.';
  end if;

  select u.id into v_user_id
    from auth.users u
   where lower(u.email) = lower(btrim(p_email));

  if v_user_id is null then
    raise exception 'No account exists for %.', btrim(p_email);
  end if;

  -- role = 'merchant' in the predicate is what makes this safe: it cannot
  -- delete an admin row, so an admin cannot lock themselves or a colleague out
  -- by mistyping an address.
  if not exists (
    select 1 from app_users a
     where a.user_id = v_user_id and a.role = 'merchant'
  ) then
    raise exception 'That account does not have merchant access to revoke.';
  end if;

  delete from app_users a
   where a.user_id = v_user_id and a.role = 'merchant';
end;
$$;

comment on function public.revoke_merchant_access(text)
  is 'Remove a merchant app_users row, leaving the auth account intact. Admin only.';

-- --------------------------------------------------------------------------
-- Grants. Revoke from public first: SECURITY DEFINER functions are executable
-- by PUBLIC by default, which would hand an unauthenticated caller the ability
-- to read every account's email address.
-- --------------------------------------------------------------------------
revoke all on function public.merchant_access_list() from public;
revoke all on function public.set_merchant_access(text, text) from public;
revoke all on function public.revoke_merchant_access(text) from public;

grant execute on function public.merchant_access_list() to authenticated;
grant execute on function public.set_merchant_access(text, text) to authenticated;
grant execute on function public.revoke_merchant_access(text) to authenticated;

-- --------------------------------------------------------------------------
-- Close the direct-write path. Reads still work for admins through a new
-- read-only policy; inserts, updates and deletes now only happen inside the
-- functions above, which check for a platform admin themselves.
-- --------------------------------------------------------------------------
drop policy if exists "admins manage app_users" on app_users;
drop policy if exists "admins read app_users" on app_users;

create policy "admins read app_users"
  on app_users for select
  to authenticated
  using (public.is_platform_admin());
