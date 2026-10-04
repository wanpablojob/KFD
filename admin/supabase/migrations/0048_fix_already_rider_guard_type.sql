-- 0048_fix_already_rider_guard_type.sql
--
-- Second defect in submit_rider_application(), introduced by 0046.
--
-- The "you are already a rider" guard declared its local as `v_already uuid`
-- but selects `r.id`, which is `text` (riders.id has no default and is
-- generated as "rdr_<8 chars>"). Postgres only raises 22P02 when it actually
-- has a row to cast, so the guard silently worked for applicants with no rider
-- row -- which is every applicant, every time, right up until one was approved.
--
-- Confirmed against production: an approved rider re-applying got
-- `22P02: invalid input syntax for type uuid: "rdr_f0a1bae3"` instead of the
-- intended "You are already a rider."
--
-- The bug is the opposite of dangerous -- the guard never blocked anyone it
-- should have blocked, it just errored -- but it turned a clear message into a
-- 400. 0046 is applied, so this replaces the function rather than editing it.

begin;

create or replace function public.submit_rider_application(
  p_full_name text,
  p_phone text,
  p_city text default null,
  p_vehicle vehicle_type default 'motorcycle',
  p_licence_ref text default null,
  p_orcr_ref text default null,
  p_government_id_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid;
  -- text, not uuid: riders.id is text (see 0047's next_rider_id()).
  v_already text;
  v_existing uuid;
  v_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Sign in to apply as a rider.'
      using errcode = '42501';
  end if;

  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'Enter your full name.';
  end if;

  if p_phone is null or btrim(p_phone) = '' then
    raise exception 'Enter a contact number.';
  end if;

  -- An approved rider does not apply. set_rider_access() has already granted
  -- them app_users.rider and a riders row; sending them back through an
  -- approval queue would let a second application sit next to a working
  -- account and confuse the next admin who looks.
  select r.id into v_already
    from riders r
   where r.user_id = v_user_id
     and r.archived_at is null;

  if v_already is not null then
    raise exception 'You are already a rider. No application needed.';
  end if;

  -- A platform admin must never end up in the applicant queue, for the same
  -- reason set_rider_access() refuses to downgrade one: an admin account that
  -- later gets a rider row would be a privilege change nobody reviewed.
  if exists (
    select 1 from app_users a
     where a.user_id = v_user_id and a.role = 'admin'
  ) then
    raise exception 'This account is a platform admin, so it cannot apply as a rider.'
      using errcode = '42501';
  end if;

  -- Idempotent per pending row: the unique index would reject a second
  -- insert, but reporting the existing id is friendlier than a 23505 and
  -- makes the mobile screen's retry-after-timeout behaviour correct.
  select a.id into v_existing
    from rider_applications a
   where a.user_id = v_user_id
     and a.status = 'pending';

  if v_existing is not null then
    return v_existing;
  end if;

  insert into rider_applications (
    user_id, full_name, phone, city, vehicle,
    licence_ref, orcr_ref, government_id_ref
  ) values (
    v_user_id,
    btrim(p_full_name),
    btrim(p_phone),
    coalesce(nullif(btrim(p_city), ''), 'Kabankalan City Proper'),
    coalesce(p_vehicle, 'motorcycle'),
    nullif(btrim(p_licence_ref), ''),
    nullif(btrim(p_orcr_ref), ''),
    nullif(btrim(p_government_id_ref), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.submit_rider_application is
  'Apply to deliver. Idempotent while a pending application exists. Grants no role and creates no riders row; an admin must approve via review_rider_application().';

grant execute on function public.submit_rider_application(text, text, text, vehicle_type, text, text, text) to authenticated;

commit;