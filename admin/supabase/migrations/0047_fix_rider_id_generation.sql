-- 0047_fix_rider_id_generation.sql
--
-- Corrects 0046's review_rider_application(): it inserted into riders without
-- supplying id, which is `text not null default null` -- there is no database
-- default, because the admin console generates ids in JS (makeId("rdr") in
-- admin/src/lib/supabase/queries.ts, producing "rdr_" + 8 lowercase base36
-- characters). Every approval therefore failed with 23502 not-null violation
-- and, because the function is atomic, left no rider row and no status change.
--
-- Confirmed against production: approving an application raised
-- `23502: null value in column "id" ... violates not-null constraint`.
--
-- 0046 is already applied, so it is not edited. This replaces the function.

begin;

-- Matches the shape makeId() produces in the admin console, so ids minted here
-- are indistinguishable from the ones the console has always written. Anything
-- parsing "rdr_<8 chars>" keeps working. A short retry loop covers the birthday
-- collision: the space is large, but two approvals inside the same millisecond
-- could still land on the same suffix.
create or replace function public.next_rider_id()
returns text
language plpgsql
volatile
set search_path to 'public'
as $$
declare
  v_candidate text;
  v_tries integer := 0;
begin
  loop
    v_candidate := 'rdr_' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);

    exit when not exists (select 1 from riders r where r.id = v_candidate);

    v_tries := v_tries + 1;
    if v_tries > 20 then
      -- Astronomically unlikely. Failing loudly beats returning a duplicate id
      -- that would overwrite an existing rider via set_rider_access().
      raise exception 'Could not allocate a unique rider id after 20 attempts.';
    end if;
  end loop;

  return v_candidate;
end;
$$;

comment on function public.next_rider_id is
  'Allocate a riders.id in the same "rdr_<8 base36 chars>" shape the admin console mints, retrying on collision. The riders table has no id default, so every server-side rider insert must call this.';

create or replace function public.review_rider_application(
  p_application_id uuid,
  p_approve boolean,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_app rider_applications%rowtype;
  v_reviewer uuid;
  v_email text;
  v_rider_id text;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform admin can review rider applications.'
      using errcode = '42501';
  end if;

  if p_application_id is null then
    raise exception 'Choose an application.';
  end if;

  select a.* into v_app from rider_applications a where a.id = p_application_id;

  if v_app.id is null then
    raise exception 'No application with that id.';
  end if;

  if v_app.status <> 'pending' then
    raise exception 'That application was already % at %.',
      v_app.status, coalesce(v_app.reviewed_at::text, 'an unknown time');
  end if;

  v_reviewer := auth.uid();

  if not p_approve then
    update rider_applications
       set status = 'rejected',
           reviewed_by = v_reviewer,
           reviewed_at = now(),
           decision_note = nullif(btrim(coalesce(p_note, '')), '')
     where id = p_application_id;

    return 'rejected';
  end if;

  -- Approve: the rider row must exist before set_rider_access() is called,
  -- because that function looks the rider up by id and raises if there is no
  -- row. Create it first, then link the account through the same audited path
  -- manual provisioning uses.
  select u.email into v_email
    from auth.users u where u.id = v_app.user_id;

  if v_email is null then
    raise exception 'That account no longer exists, so it cannot be approved.';
  end if;

  -- next_rider_id() is what 0046 omitted; without it this insert is a 23502.
  v_rider_id := public.next_rider_id();

  -- riders.email is NOT NULL and unique, and has no default. The application's
  -- auth email is the only sensible value: it is the account being approved, and
  -- duplicates are already impossible because auth enforces unique emails.
  insert into riders (id, name, email, phone, city, vehicle, status)
  values (
    v_rider_id,
    v_app.full_name,
    v_email,
    v_app.phone,
    v_app.city,
    v_app.vehicle,
    -- Approved, not online. Going online is the rider's own tap on the
    -- availability toggle; approving a licence check is not consent to work.
    'offline'
  );

  -- Fails loudly and rolls the rider row back with the application update if
  -- the account turns out to be an admin or already linked elsewhere. That is
  -- the intended behaviour: never leave an 'approved' application without a
  -- usable rider.
  perform public.set_rider_access(v_email, v_rider_id);

  update rider_applications
     set status = 'approved',
         reviewed_by = v_reviewer,
         reviewed_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_application_id;

  return v_rider_id;
end;
$$;

comment on function public.review_rider_application is
  'Approve or reject a pending rider application. Approval creates the riders row (via next_rider_id()) and links the auth account via set_rider_access(); it returns the new rider id, or ''rejected'' on rejection.';

-- next_rider_id() is granted to nobody but its caller. review_rider_application()
-- is SECURITY DEFINER so it reaches it regardless, and nothing else in the app
-- needs to mint rider ids, so an authenticated grant would only widen the
-- attack surface for no benefit.
revoke execute on function public.next_rider_id() from public, anon, authenticated;
grant execute on function public.next_rider_id() to service_role;

grant execute on function public.review_rider_application(uuid, boolean, text) to authenticated;

commit;