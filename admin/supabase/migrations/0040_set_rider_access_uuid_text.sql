-- 0018's set_rider_access has never run. It compares riders.user_id (uuid)
-- against p_rider_id (text) with a bare `<>`:
--
--   if v_existing is not null and v_existing <> p_rider_id then
--
-- Postgres has no uuid <> text operator, and SQL AND does not protect the
-- right operand from a type error -- the operator is resolved when the
-- expression is first evaluated, not per row. So the statement raises 42883
-- on every call, including the common case where v_existing IS null and the
-- NULL check would have short-circuited. Verified directly:
--
--   select null::uuid <> 'rdr_02'::text;   -- ERROR 42883, not NULL
--
-- That makes the admin riders page's "Link account" dialog dead, and it is the
-- only supported way to attach an auth account to a rider -- i.e. the only way
-- a rider can sign in. rdr_01 is linked, but only because it was seeded or set
-- up before this path existed.
--
-- One-character-class fix: cast the uuid side to text, matching riders.id,
-- which is text (0001). The body below is 0018's verbatim apart from that
-- cast -- mechanically diffed rather than retyped, in the same spirit as the
-- 0037 rebuild.

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

  if v_existing is not null and v_existing::text <> p_rider_id then
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
