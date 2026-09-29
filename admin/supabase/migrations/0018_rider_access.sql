-- --------------------------------------------------------------------------
-- Rider access (Phase 6, mobile rider app)
--
-- Links an auth account to a rider row (riders.user_id), then gives that
-- rider SQL-scoped access to:
--
--   * their own profile in `riders`, so the mobile app can render name,
--     vehicle, status, earnings and deliveries without reading the whole
--     table;
--   * the orders assigned to them.
--
-- The orders link is intentionally by free-text name, not a new FK. The
-- schema deliberately keeps orders.rider as a display name (0001 sets it,
-- 0010 archives riders without touching it, 0012 leaves it off the public
-- track_order projection). Adding orders.rider_user_id would be a parallel
-- identity column that 0012 ruled out for customers ("Identity lives in
-- app_users, not copied onto every row that mentions the person"). So a
-- rider's assigned orders are resolved from their own name, like the admin
-- app's fetchOrdersByRider does today.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- Profile link
-- --------------------------------------------------------------------------

alter table riders add column if not exists user_id uuid
  references auth.users (id) on delete cascade;

-- One auth account is one rider. A second link would mean two riders
-- receiving one rider's deliveries.
create unique index if not exists riders_user_id_idx on riders (user_id)
  where user_id is not null;

-- --------------------------------------------------------------------------
-- RLS: a rider sees only their own profile row
--
-- Read is a plain policy. Write is deliberately NOT one: 0015 established
-- the rule that an UPDATE policy is a door that any authenticated user walks
-- through, so writes that should only happen under named conditions become
-- SECURITY DEFINER functions (rider_set_status, rider_mark_delivered below)
-- that re-check the caller themselves. A rider toggles online/busy/offline;
-- earnings, deliveries and the name itself stay admin-only (the 0002 FOR ALL
-- policy guards those with is_platform_admin()).
-- --------------------------------------------------------------------------

drop policy if exists "riders read own profile" on riders;
create policy "riders read own profile"
  on riders for select
  to authenticated
  using (user_id = auth.uid());

-- --------------------------------------------------------------------------
-- RLS: a rider reads the orders assigned to them
--
-- Matched by name, with the same "who am I" subquery the admin app does in
-- fetchOrdersByRider. Read-only: status transitions stay an admin/merchant
-- concern (0002's scoped orders policy) and the rider app is a delivery
-- list, not an order editor.
-- --------------------------------------------------------------------------

drop policy if exists "riders read assigned orders" on orders;
create policy "riders read assigned orders"
  on orders for select
  to authenticated
  using (
    rider is not null
    and rider <> 'Unassigned'
    and rider = (
      select name from riders
       where user_id = auth.uid()
       limit 1
    )
  );

-- --------------------------------------------------------------------------
-- Grant feedback loop: the admin app's fetchOrdersByRider filters on this
-- same column, so nothing new is needed. But orders.rider is free text with
-- no index; the per-call subquery above is the only consumer so far, and the
-- row count is tiny. Leave it: a speculative index here would be one more
-- thing to prove justified.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- Rider provisioning (mirrors 0011's merchant functions)
--
-- An admin links an existing auth account to a rider row (or moves the link,
-- or removes it). auth.users is not exposed through PostgREST, so this cannot
-- be done from the browser without SQL. Like 0011, these are the only writers
-- of app_users and the only writers of riders.user_id, and they are SECURITY
-- DEFINER, so each re-checks is_platform_admin() itself rather than trusting
-- the caller.
-- --------------------------------------------------------------------------

-- Resolve a rider's account for display: which riders are linked to which
-- auth accounts (and which riders are unlinked and waiting for one).
create or replace function public.rider_access_list()
returns table (
  rider_id text,
  rider_name text,
  user_id uuid,
  email text,
  archived_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.name,
    r.user_id,
    coalesce(u.email, '(none)') as email,
    r.archived_at
  from riders r
  left join auth.users u on u.id = r.user_id
  where public.is_platform_admin()
  order by r.name asc;
$$;

comment on function public.rider_access_list()
  is 'Every rider with its linked auth account (or none) and email. Empty for a non-admin.';

-- Attach an existing auth account to a rider row, or move a link.
--
-- This is intentionally an attach-to-row, not a create: provisioning a login
-- is a Supabase Auth operation (0011 explains why), and rider rows already
-- exist in the seed data.
create or replace function public.set_rider_access(
  p_email text,
  p_rider_id text
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
  v_existing uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform admin can change rider access.'
      using errcode = '42501';
  end if;

  if p_rider_id is null or btrim(p_rider_id) = '' then
    raise exception 'Choose a rider.';
  end if;

  if p_email is null or btrim(p_email) = '' then
    raise exception 'Enter the email address of an existing account.';
  end if;

  select r.archived_at into v_archived_at
    from riders r where r.id = p_rider_id;

  if v_archived_at is null and not exists (
    select 1 from riders where id = p_rider_id
  ) then
    raise exception 'No rider with id %.', p_rider_id;
  end if;

  if v_archived_at is not null then
    raise exception 'That rider is archived. Restore them before attaching an account.';
  end if;

  select u.id into v_user_id
    from auth.users u
   where lower(u.email) = lower(btrim(p_email));

  if v_user_id is null then
    raise exception
      'No account exists for %. Create the account in Supabase Auth first -- this page does not create accounts.',
      btrim(p_email);
  end if;

  -- Never downgrade an admin (0011's guard). A platform admin who types a
  -- colleague's address must be told, not silently demoted to a rider.
  select a.role into v_role from app_users a where a.user_id = v_user_id;

  if v_role = 'admin' then
    raise exception 'That account is a platform admin, so it is not a rider.';
  end if;

  -- One auth account is one rider. If the account already rides, move the
  -- link -- the old rider row keeps its history, which is exactly what a
  -- free-text orders.rider makes recoverable (0010's argument for archive).
  select r.user_id into v_existing
    from riders r where r.user_id = v_user_id;

  if v_existing is not null and v_existing <> p_rider_id then
    update riders set user_id = null where user_id = v_user_id;
  end if;

  update riders set user_id = v_user_id where id = p_rider_id;

  insert into app_users (user_id, role)
  values (v_user_id, 'rider')
  on conflict (user_id) do update
    set role = 'rider',
        restaurant_id = null;

  return v_user_id;
end;
$$;

comment on function public.set_rider_access(text, text)
  is 'Attach or move an existing auth account to a rider row. Admin only.';

-- Remove a rider's account link. The auth account and the rider row are both
-- left intact: the former is a Supabase Auth operation, and the latter keeps
-- the free-text order history (0010's reasoning).
create or replace function public.revoke_rider_access(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role app_role;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform admin can change rider access.'
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

  -- role = 'rider' in the predicate makes this safe: it cannot delete an
  -- admin row, so an admin cannot lock themselves out by mistyping.
  select a.role into v_role from app_users a where a.user_id = v_user_id;

  if v_role <> 'rider' then
    raise exception 'That account does not have rider access to revoke.';
  end if;

  delete from app_users a
   where a.user_id = v_user_id and a.role = 'rider';

  update riders set user_id = null where user_id = v_user_id;
end;
$$;

comment on function public.revoke_rider_access(text)
  is 'Remove a rider app_users row and clear its riders.user_id link, leaving both rows intact. Admin only.';

-- --------------------------------------------------------------------------
-- Grants. Revoke from public first: SECURITY DEFINER functions are executable
-- by PUBLIC by default, which would hand an unauthenticated caller the ability
-- to read every rider's account link.
-- --------------------------------------------------------------------------
revoke all on function public.rider_access_list() from public;
revoke all on function public.set_rider_access(text, text) from public;
revoke all on function public.revoke_rider_access(text) from public;

grant execute on function public.rider_access_list() to authenticated;
grant execute on function public.set_rider_access(text, text) to authenticated;
grant execute on function public.revoke_rider_access(text) to authenticated;

-- Explicit anon revokes (0016's posture): Supabase's default privileges grant
-- EXECUTE to anon on every new function, and `revoke ... from public` leaves
-- that default grant intact. All five rider functions are revoked from anon;
-- they are either admin-only (provisioning/list) or rider-only (status,
-- mark_delivered). Nothing here is for the anon key.
revoke all on function public.rider_access_list() from anon;
revoke all on function public.set_rider_access(text, text) from anon;
revoke all on function public.revoke_rider_access(text) from anon;

-- --------------------------------------------------------------------------
-- A rider toggles availability
--
-- Same shape as rider_mark_delivered: a SECURITY DEFINER function that
-- re-checks the caller is a rider and only then writes the one column.
-- --------------------------------------------------------------------------
create or replace function public.rider_set_status(p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('online', 'busy', 'offline') then
    raise exception 'Status must be online, busy or offline.';
  end if;

  if not exists (
    select 1 from riders where user_id = auth.uid()
  ) then
    raise exception 'Your account is not linked to a rider.'
      using errcode = '42501';
  end if;

  update riders
     set status = p_status::public.rider_status
   where user_id = auth.uid();
end;
$$;

comment on function public.rider_set_status(text)
  is 'Toggle your online/busy/offline availability. Rider only.';

revoke all on function public.rider_set_status(text) from public;
revoke all on function public.rider_set_status(text) from anon;
grant execute on function public.rider_set_status(text) to authenticated;

-- --------------------------------------------------------------------------
-- A rider completes a delivery
--
-- Order status went from "scoped access: orders" (admin or the merchant that
-- owns the restaurant) to now wanting the assigned rider to advance an order
-- to 'delivered'. A RIDER UPDATE policy on orders would let any rider edit
-- any order their name matches; a function scoped to the caller and guarded
-- by status keeps the write minimal and legible.
-- --------------------------------------------------------------------------
create or replace function public.rider_mark_delivered(p_order_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider_name text;
  v_status order_status;
begin
  select r.name into v_rider_name
    from riders r
   where r.user_id = auth.uid();

  if v_rider_name is null then
    raise exception 'Your account is not linked to a rider.'
      using errcode = '42501';
  end if;

  select o.status into v_status
    from orders o
   where o.id = p_order_id;

  if v_status is null then
    raise exception 'No order with id %.', p_order_id;
  end if;

  if (select o.rider from orders o where o.id = p_order_id) <> v_rider_name then
    raise exception 'That order is not assigned to you.'
      using errcode = '42501';
  end if;

  -- Only an in-flight order advances. A delivered order is already done; a
  -- cancelled one never leaves the kitchen; an early one is not yours to push.
  if v_status not in ('out_for_delivery', 'confirmed', 'preparing') then
    raise exception 'That order cannot be marked delivered from its current state (%).', v_status;
  end if;

  update orders
     set status = 'delivered'
   where id = p_order_id;

  update riders
     set deliveries = deliveries + 1
   where user_id = auth.uid();
end;
$$;

comment on function public.rider_mark_delivered(text)
  is 'Mark one of your assigned orders delivered and bump your delivery count. Rider only.';

revoke all on function public.rider_mark_delivered(text) from public;
revoke all on function public.rider_mark_delivered(text) from anon;
grant execute on function public.rider_mark_delivered(text) to authenticated;