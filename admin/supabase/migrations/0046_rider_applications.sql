-- 0046_rider_applications.sql
--
-- Phase 5, part 1: a rider applies for themselves instead of waiting for an
-- admin to provision them by hand.
--
-- Until now the only way to become a rider was set_rider_access(), which an
-- admin calls with an email that must already exist in auth. That means the
-- person who wants to deliver has to find a dispatcher, and the dispatcher has
-- to know the account exists before they can attach it. set_rider_access()
-- itself says so: "Create the account in Supabase Auth first -- this page
-- does not create accounts." So the missing half is a way for a rider to
-- apply, and this migration adds it.
--
-- Design, and why it is shaped this way:
--
-- 1. An application is NOT a rider. Applying does not create a row in
--    `riders`, does not set an app_users role, and does not make anybody
--    online. `admin_dispatch_order` only offers to riders with
--    status = 'online', and a pending applicant has no rider row at all, so
--    an unapproved applicant can never be handed a real order. Approval is
--    the gate, and it stays a human decision.
--
-- 2. Status is a separate enum, not rider_status. rider_status is
--    online/busy/offline and describes a working rider; a pending applicant
--    is none of those, and adding a fourth value would leak "pending"
--    semantics into every query that filters on availability -- including
--    dispatch. A separate enum keeps that blast radius at zero.
--
-- 3. One live application per person. Without the unique index below, a
--    rider could submit repeatedly and an admin would review duplicates
--    while a real applicant sits unreviewed at the bottom of a queue. The
--    index is on (user_id) where status = 'pending', which is the state
--    that matters. An approved or rejected application does not block a
--    re-application: a rejected rider fixing their documents and trying
--    again is legitimate and common, and forcing them to reuse the rejected
--    row would rewrite the review history.
--
-- 4. Review is admin-only, enforced in the function, not in the UI. The
--    mobile app can call submit_rider_application() and nothing else. There
--    is no client-side "is admin" check that decides who may approve, because
--    that check would live in JS on a device the applicant controls.
--
-- 5. On approval the rider row is created AND the auth account is linked in
--    one transaction, by reusing the same semantics as set_rider_access().
--    That function's guards are the valuable part: it refuses to downgrade a
--    platform admin, it refuses an archived rider, and it moves an existing
--    link rather than leaving two riders pointing at one account. This
--    migration does not reimplement any of that; it calls set_rider_access()
--    so an approver gets identical safety for free. If that call fails, the
--    whole approval aborts rather than leaving an approved application with
--    no rider row.
--
-- 6. set_rider_access() requires an existing auth.users row matching the
--    email. An applicant is signed in when they apply (the application is
--    keyed to auth.uid()), so that row necessarily exists. But it looks the
--    rider up by the rider row's own record, and before approval there is no
--    rider row. So approval creates the `riders` row first, then calls
--    set_rider_access() against it. That ordering is the whole trick.

begin;

-- ---------------------------------------------------------------------------
-- Pending applications
-- ---------------------------------------------------------------------------

create type rider_application_status as enum (
  'pending',
  'approved',
  'rejected'
);

create table rider_applications (
  id            uuid primary key default gen_random_uuid(),

  -- The auth identity that applied. on delete cascade: if the account is
  -- deleted, its application goes with it. An application row pointing at a
  -- dead auth id is not reviewable and is not evidence of anything.
  user_id       uuid not null references auth.users (id) on delete cascade,

  full_name     text not null,
  phone         text not null,
  city          text not null default 'Kabankalan City Proper',
  vehicle       vehicle_type not null default 'motorcycle',

  -- Document references, not the documents. Storage is not configured for
  -- this yet (there is no bucket in this project), so these hold whatever
  -- locator the app has. Storing a path rather than a file means the
  -- approval flow works end to end today and photo upload can populate the
  -- same columns later without a schema change.
  licence_ref   text,
  orcr_ref      text,
  government_id_ref text,

  status        rider_application_status not null default 'pending',

  -- Review outcome. reviewer_user_id is set on both approve and reject so
  -- "who touched this" is answerable either way.
  reviewed_by   uuid references auth.users (id) on delete set null,
  reviewed_at   timestamp with time zone,
  decision_note text,

  created_at    timestamp with time zone not null default now(),
  updated_at    timestamp with time zone not null default now(),

  constraint rider_applications_name_not_blank
    check (btrim(full_name) <> ''),
  constraint rider_applications_phone_not_blank
    check (btrim(phone) <> '')
);

-- One pending application per person. Partial, so approve/reject unblocks
-- re-application. See point 3 above.
create unique index rider_applications_one_pending_per_user
  on rider_applications (user_id)
  where status = 'pending';

-- The admin queue is "oldest pending first", so index that directly rather
-- than letting it sort on every load.
create index rider_applications_pending_created
  on rider_applications (created_at)
  where status = 'pending';

comment on table rider_applications is
  'Rider self-service applications (Phase 5). An application is not a rider: it grants no app_users role and creates no riders row until an admin approves it via review_rider_application().';

comment on column rider_applications.status is
  'pending = awaiting review, approved = rider row created and account linked, rejected = declined (the applicant may re-apply).';

create trigger rider_applications_touch
  before update on rider_applications
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- No policy for applicants beyond their own row, and no insert/update/delete
-- policy at all: every write goes through a SECURITY DEFINER function that
-- does its own authorisation. Direct table writes are not a path to anything.

alter table rider_applications enable row level security;

create policy "applicants read own application"
  on rider_applications for select
  to authenticated
  using (user_id = auth.uid());

create policy "admins read all applications"
  on rider_applications for select
  to authenticated
  using (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- submit_rider_application()
-- ---------------------------------------------------------------------------

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
  v_existing uuid;
  v_already uuid;
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

-- ---------------------------------------------------------------------------
-- my_rider_application()
-- ---------------------------------------------------------------------------

create or replace function public.my_rider_application()
returns table (
  id uuid,
  status rider_application_status,
  full_name text,
  phone text,
  city text,
  vehicle vehicle_type,
  licence_ref text,
  orcr_ref text,
  government_id_ref text,
  decision_note text,
  created_at timestamp with time zone,
  reviewed_at timestamp with time zone
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    a.id, a.status, a.full_name, a.phone, a.city, a.vehicle,
    a.licence_ref, a.orcr_ref, a.government_id_ref,
    a.decision_note, a.created_at, a.reviewed_at
  from rider_applications a
  where a.user_id = auth.uid()
  order by a.created_at desc
  limit 1;
$$;

comment on function public.my_rider_application is
  'The signed-in applicant''s most recent application, whatever its status. Drives the mobile application screen.';

grant execute on function public.my_rider_application() to authenticated;

-- ---------------------------------------------------------------------------
-- fetch_rider_applications()
-- ---------------------------------------------------------------------------

create or replace function public.fetch_rider_applications(
  p_status text default null
)
returns table (
  id uuid,
  status rider_application_status,
  full_name text,
  phone text,
  city text,
  vehicle vehicle_type,
  licence_ref text,
  orcr_ref text,
  government_id_ref text,
  decision_note text,
  created_at timestamp with time zone,
  reviewed_at timestamp with time zone,
  applicant_email text,
  applicant_user_id uuid
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    a.id, a.status, a.full_name, a.phone, a.city, a.vehicle,
    a.licence_ref, a.orcr_ref, a.government_id_ref,
    a.decision_note, a.created_at, a.reviewed_at,
    coalesce(u.email, '(none)') as applicant_email,
    a.user_id as applicant_user_id
  from rider_applications a
  left join auth.users u on u.id = a.user_id
  where public.is_platform_admin()
    and (p_status is null or a.status::text = p_status)
  order by case when a.status = 'pending' then 0 else 1 end,
           a.created_at desc
  limit 200;
$$;

comment on function public.fetch_rider_applications is
  'Admin queue of rider applications, pending first then most recent. No-op (empty) for non-admins via is_platform_admin().';

grant execute on function public.fetch_rider_applications(text) to authenticated;

-- ---------------------------------------------------------------------------
-- review_rider_application()
-- ---------------------------------------------------------------------------

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

  insert into riders (name, phone, city, vehicle, status)
  values (
    v_app.full_name,
    v_app.phone,
    v_app.city,
    v_app.vehicle,
    -- Approved, not online. Going online is the rider's own tap on the
    -- availability toggle; approving a licence check is not consent to work.
    'offline'
  )
  returning id into v_rider_id;

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
  'Approve or reject a pending rider application. Approval creates the riders row and links the auth account via set_rider_access(); it returns the new rider id, or ''rejected'' on rejection.';

grant execute on function public.review_rider_application(uuid, boolean, text) to authenticated;

commit;