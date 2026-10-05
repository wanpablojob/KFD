-- --------------------------------------------------------------------------
-- 0051: rider notes, activity timeline, admin overview
--
-- Three groups, all read through security-definer RPCs rather than table
-- grants, so the admin UI needs no direct table access:
--
--   1. rider_notes. Admin-only free text about a rider, never surfaced to the
--      rider app. There is no rider-notes read path anywhere in this file set,
--      and the table has no authenticated grant at all, so "never exposed to the
--      rider app" is enforced by privileges, not by UI omission.
--
--   2. A rider activity timeline. 0050 added the generic audit_log columns and
--      the audit_rider_event() writer; this wires the remaining event sources
--      and the read RPC.
--
--   3. admin_rider_overview() + admin_rider_earnings_by_day(). The riders list
--      needs current job, failure counts and week earnings per row. Doing that
--      from the browser would be one extra request per row. One RPC returns it
--      all instead.
--
-- Also fixes a reachable bug in review_rider_application(): approving an
-- application whose email is already on another rider row raises a raw 23505.
--
-- 4.4 (cash handling, rider_remittances, payouts CSV) is deliberately NOT here.
-- Cash reconciliation is a business-process decision that was not in scope, so
-- there is no remittance ledger to audit against.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- 1. rider_notes
-- --------------------------------------------------------------------------
create table if not exists public.rider_notes (
  id bigint generated always as identity primary key,
  rider_id text not null references public.riders (id) on delete cascade,
  body text not null,
  -- The author's auth account. Set null if the account is later deleted: a note
  -- that disappears with the person who wrote it would be a worse outcome than
  -- a note whose author reads as "(removed)".
  author_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- An empty note is never worth storing, and a note long enough to break the
  -- timeline card is a link or a paste, not a note.
  constraint rider_notes_body_length check (
    char_length(btrim(body)) between 1 and 2000
  )
);

create index if not exists rider_notes_rider_created_idx
  on public.rider_notes (rider_id, created_at desc);

comment on table public.rider_notes is
  'Admin-only notes about a rider. Not exposed to the rider app in any code path, and not readable by anon or authenticated: every read goes through admin_rider_notes().';

alter table public.rider_notes enable row level security;

-- Same reasoning as 0039 on rider_payouts: no policy is the point. RLS with no
-- policy returns [], but the request still succeeds, so correctness would depend
-- on the policy being right rather than on the grant. Revoking makes an
-- unauthenticated read fail outright instead.
revoke all on table public.rider_notes from anon;
revoke all on table public.rider_notes from authenticated;
grant all on table public.rider_notes to service_role;

create or replace function public.admin_add_rider_note(
  p_rider_id text,
  p_body text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note_id bigint;
  v_body text;
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  v_body := btrim(coalesce(p_body, ''));

  if v_body = '' then
    raise exception 'A note cannot be empty.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from riders r where r.id = p_rider_id) then
    raise exception 'That rider no longer exists.' using errcode = 'P0001';
  end if;

  insert into rider_notes (rider_id, body, author_user_id)
  values (p_rider_id, left(v_body, 2000), auth.uid())
  returning id into v_note_id;

  perform public.audit_rider_event(
    p_rider_id,
    'rider.note_added',
    jsonb_build_object('note_id', v_note_id)
  );

  return v_note_id;
end;
$$;

comment on function public.admin_add_rider_note(text, text) is
  'Adds an admin-only note to a rider and records a rider.note_added audit event. Returns the new note id. Admins only.';

revoke all on function public.admin_add_rider_note(text, text) from public;
revoke all on function public.admin_add_rider_note(text, text) from anon;
grant execute on function public.admin_add_rider_note(text, text) to authenticated;

-- Newest first, matching the timeline above it on the page. The author's email
-- comes from auth.users, which this function can read only because it is
-- SECURITY DEFINER; the admin console has no direct access to that table.
create or replace function public.admin_rider_notes(p_rider_id text)
returns table (
  id bigint,
  body text,
  author_email text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  return query
  select
    n.id,
    n.body,
    coalesce(u.email, '(account removed)'),
    n.created_at
  from rider_notes n
  left join auth.users u on u.id = n.author_user_id
  where n.rider_id = p_rider_id
  order by n.created_at desc, n.id desc;
end;
$$;

comment on function public.admin_rider_notes(text) is
  'Admin-only: this rider''s internal notes, newest first, with author email. Admins only. There is deliberately no non-admin reader.';

revoke all on function public.admin_rider_notes(text) from public;
revoke all on function public.admin_rider_notes(text) from anon;
grant execute on function public.admin_rider_notes(text) to authenticated;

-- --------------------------------------------------------------------------
-- 2. Activity timeline
--
-- Status changes and account attach/revoke are captured by triggers rather than
-- by new RPCs, and that is a deliberate choice:
--
--   * setRiderStatus() in admin/src/lib/supabase/queries.ts is a direct client
--     UPDATE on riders, not an RPC. An RPC-based audit would have to replace
--     that call AND would still miss any future writer.
--   * set_rider_access() / revoke_rider_access() (0018) are RPCs, but
--     review_rider_application() calls set_rider_access() too, so approving an
--     application is an account attach too. A trigger catches all three paths.
--
-- Both triggers are SECURITY DEFINER because the update may arrive straight
-- from the browser as the `authenticated` role, which has no INSERT privilege
-- on audit_log. A non-definer trigger would fail the status change outright.
-- --------------------------------------------------------------------------
create or replace function public.riders_audit_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.audit_rider_event(
      old.id,
      'rider.status_changed',
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;

  if new.user_id is distinct from old.user_id then
    perform public.audit_rider_event(
      old.id,
      case
        when new.user_id is null then 'rider.access_revoked'
        else 'rider.access_attached'
      end,
      jsonb_build_object(
        'user_id', new.user_id,
        'email', (
          select u.email from auth.users u where u.id = new.user_id
        )
      )
    );
  end if;

  return new;
end;
$$;

comment on function public.riders_audit_changes() is
  'Trigger function: records rider.status_changed and account attach/revoke events in audit_log. SECURITY DEFINER because the status update may arrive directly from the authenticated role, which cannot write audit_log.';

drop trigger if exists riders_audit_changes on riders;
create trigger riders_audit_changes
  after update on riders
  for each row
  execute function public.riders_audit_changes();

-- The timeline itself: audit rows for one rider, newest first, with the actor's
-- email. Admins only.
create or replace function public.admin_rider_activity(p_rider_id text)
returns table (
  id bigint,
  event text,
  detail jsonb,
  actor_email text,
  changed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  return query
  select
    a.id,
    coalesce(a.event, 'rider.' || a.action),
    a.detail,
    coalesce(u.email, a.actor_user_id::text, 'system'),
    a.changed_at
  from audit_log a
  left join auth.users u on u.id = a.actor_user_id
  where a.rider_id = p_rider_id
  order by a.changed_at desc, a.id desc
  limit 200;
end;
$$;

comment on function public.admin_rider_activity(text) is
  'Admin-only: audit events for one rider, newest first, capped at 200 rows. Covers status changes, suspension, account attach/revoke and note additions.';

revoke all on function public.admin_rider_activity(text) from public;
revoke all on function public.admin_rider_activity(text) from anon;
grant execute on function public.admin_rider_activity(text) to authenticated;

-- --------------------------------------------------------------------------
-- 3. admin_rider_overview()
--
-- One call for the whole list, because the alternative is a per-row request for
-- current job, failed count and week earnings. It returns the raw numbers and
-- leaves the flag decisions to the client (src/lib/rider-flags.ts), so the
-- thresholds live in one tested place instead of being duplicated in SQL and
-- TypeScript and drifting apart.
--
-- Current job is the newest in-flight order, matching what the rider app shows:
-- confirmed, preparing or out_for_delivery. Delivered and cancelled are history,
-- and a second in-flight order is not something the current dispatch model can
-- create, but ordering by placed_at keeps the answer stable if it ever can.
-- --------------------------------------------------------------------------
create or replace function public.admin_rider_overview()
returns table (
  rider_id text,
  name text,
  email text,
  phone text,
  city text,
  vehicle vehicle_type,
  status rider_status,
  deliveries integer,
  rating numeric,
  earnings numeric,
  archived_at timestamptz,
  suspended_at timestamptz,
  suspended_reason text,
  user_id uuid,
  current_order_id text,
  current_order_reference text,
  current_order_status order_status,
  delivered_count integer,
  failed_count integer,
  week_earnings numeric,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  return query
  select
    r.id,
    r.name,
    r.email,
    coalesce(r.phone, ''),
    r.city,
    r.vehicle,
    r.status,
    r.deliveries,
    r.rating,
    r.earnings,
    r.archived_at,
    r.suspended_at,
    r.suspended_reason,
    r.user_id,
    cur.id,
    cur.reference,
    cur.status,
    (select count(*)::int from orders o
      where o.rider_id = r.id and o.status = 'delivered'),
    (select count(*)::int from orders o
      where o.rider_id = r.id and o.delivery_failed_at is not null),
    coalesce((
      select sum(p.amount) from rider_payouts p
       where p.rider_id = r.id
         and p.earned_at >= date_trunc('week', now())
    ), 0),
    r.updated_at
  from riders r
  left join lateral (
    select o.id, o.reference, o.status
      from orders o
     where o.rider_id = r.id
       and o.status in ('confirmed', 'preparing', 'out_for_delivery')
     order by o.placed_at desc
     limit 1
  ) cur on true
  order by r.name;
end;
$$;

comment on function public.admin_rider_overview() is
  'Admin-only: every rider with current in-flight order, delivered and failed counts, and week earnings, in one call. Flag thresholds are applied client-side so they are not duplicated here.';

revoke all on function public.admin_rider_overview() from public;
revoke all on function public.admin_rider_overview() from anon;
grant execute on function public.admin_rider_overview() to authenticated;

-- --------------------------------------------------------------------------
-- 4. admin_rider_earnings_by_day()
--
-- generate_series, not a plain group by: a rider with two deliveries on Monday
-- and none for the next six days has seven points to draw, and a group by
-- returns one. Missing days as NULL would break the bar height maths in
-- charts/revenue-chart.tsx, so they are emitted as 0.
--
-- The range is clamped to 90 days. The caller picks the window; this stops a
-- crafted p_from of 1970 turning one chart request into ~20k rows.
-- --------------------------------------------------------------------------
create or replace function public.admin_rider_earnings_by_day(
  p_rider_id text,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  day date,
  amount numeric,
  deliveries integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz;
  v_to timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  v_from := coalesce(p_from, date_trunc('day', now()) - interval '13 days');
  v_to := coalesce(p_to, date_trunc('day', now()) + interval '1 day');

  if v_from > v_to then
    raise exception 'The start of the range must be before the end.'
      using errcode = 'P0001';
  end if;

  -- Calendar days, in the database's own timezone, so a payout recorded at
  -- 23:30 lands on the day the admin sees rather than the next one.
  v_from := date_trunc('day', v_from);
  v_to := date_trunc('day', v_to) + interval '1 day';

  if v_to - v_from > interval '91 days' then
    v_from := v_to - interval '91 days';
  end if;

  return query
  select
    d.day::date,
    coalesce(sum(p.amount), 0),
    count(p.id)::integer
  from generate_series(v_from, v_to - interval '1 day', interval '1 day')
       as d(day)
  left join rider_payouts p
    on p.rider_id = p_rider_id
   and p.earned_at >= d.day
   and p.earned_at < d.day + interval '1 day'
  group by d.day
  order by d.day;
end;
$$;

comment on function public.admin_rider_earnings_by_day(text, timestamptz, timestamptz) is
  'Admin-only: payout amount and delivery count per calendar day for one rider, with empty days emitted as zero, capped to 91 days.';

revoke all on function public.admin_rider_earnings_by_day(text, timestamptz, timestamptz) from public;
revoke all on function public.admin_rider_earnings_by_day(text, timestamptz, timestamptz) from anon;
grant execute on function public.admin_rider_earnings_by_day(text, timestamptz, timestamptz) to authenticated;

-- --------------------------------------------------------------------------
-- 5. review_rider_application(): block a duplicate email before the insert
--
-- 0047's comment claims "duplicates are already impossible because auth enforces
-- unique emails". That is only true between auth accounts. riders.email is
-- independently NOT NULL UNIQUE, and the admin console's upsertRider() can write
-- any email into it without linking an account. So this is reachable:
--
--   1. An admin adds a rider by hand with email maria@example.com, no account
--      linked. (The console warns about this on the access panel.)
--   2. Later, somebody signs up with maria@example.com and applies to deliver.
--   3. Approving inserts a second riders row with the same email -> 23505 unique
--      violation, raised as a raw Postgres string in the admin UI.
--
-- The applicant cannot be told to use a different address, because the address
-- is the account. So the fix is to refuse the approval and say whose rider row
-- is in the way, which is also what an admin needs: the way out is to merge or
-- archive that row, or revoke the duplicate account.
--
-- P0001 rather than 23505 so the UI can distinguish "you asked for something
-- impossible" from "a constraint fired somewhere unexpected", and so the message
-- is one this function wrote rather than one Postgres composed.
-- --------------------------------------------------------------------------
create or replace function public.review_rider_application(
  p_application_id uuid,
  p_approve boolean,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_app rider_applications%rowtype;
  v_reviewer uuid;
  v_email text;
  v_rider_id text;
  v_clash_id text;
  v_clash_name text;
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

    -- No audit_rider_event() here on purpose. A rejected applicant has no
    -- riders row, so rider_id would be NULL and the event would be attached to
    -- nobody's timeline. The application's own reviewed_by / reviewed_at /
    -- decision_note / status columns are already the record of this decision.

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

  -- The duplicate check. Archived rows still count: they keep their email, and
  -- two riders rows sharing an email breaks the uniqueness the table promises
  -- even if the archived one is never dispatched again.
  select r.id, r.name into v_clash_id, v_clash_name
    from riders r
   where lower(r.email) = lower(v_email)
   limit 1;

  if v_clash_id is not null then
    raise exception
      'Cannot approve: % already exists as rider % (%). That rider row has to be removed or its email corrected first.',
      v_email, v_clash_name, v_clash_id
      using errcode = 'P0001';
  end if;

  -- next_rider_id() is what 0046 omitted; without it this insert is a 23502.
  v_rider_id := public.next_rider_id();

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

  -- rider_id is set, so this lands on the new rider's timeline. set_rider_access
  -- separately raises rider.access_attached, which the trigger records.
  perform public.audit_rider_event(
    v_rider_id,
    'rider.application_approved',
    jsonb_build_object(
      'application_id', p_application_id,
      'full_name', v_app.full_name,
      'note', nullif(btrim(coalesce(p_note, '')), '')
    )
  );

  return v_rider_id;
end;
$$;

comment on function public.review_rider_application is
  'Approve or reject a pending rider application. Approval creates the riders row (via next_rider_id()) and links the auth account via set_rider_access(); it returns the new rider id, or ''rejected'' on rejection. Refuses to approve when an existing rider row already holds the applicant''s email, naming that rider, instead of surfacing a raw unique-violation.';

grant execute on function public.review_rider_application(uuid, boolean, text) to authenticated;

-- --------------------------------------------------------------------------
-- 6. fetch_rider_applications(): waiting time for the queue
--
-- DROP first, then CREATE. PostgreSQL refuses to change the return type of an
-- existing function under CREATE OR REPLACE, and adding waiting_days does
-- exactly that. It is a real drop: PostgREST caches function metadata, so the
-- function is briefly absent from the schema cache. The old definition was
-- granted to authenticated and this re-grants it, so the window is a failed
-- call rather than a permission error.
--
-- p_status stays text, not rider_application_status. 0046 declared it as text
-- and the admin console passes a string; changing the type would leave two
-- overloads named fetch_rider_applications and make the PostgREST call
-- ambiguous. It is still matched as text against the enum, so an unknown value
-- returns nothing rather than everything.
--
-- waiting_days is computed here rather than in the browser so the ordering the
-- admin sees ("oldest first") is the ordering the query guarantees, and so it
-- cannot disagree with itself after a client-side sort.
--
-- Whole days elapsed, from the elapsed-seconds form rather than
-- current_date - created_at::date: the date form depends on the session
-- timezone, so the same application would read as 2 days old to one admin and
-- 3 to another on a machine set to UTC. This counts actual elapsed time.
-- Floor, not round: an application from 23:00 yesterday has genuinely waited
-- 0 whole days, and rounding up would flag the whole queue as urgent.
-- --------------------------------------------------------------------------
drop function if exists public.fetch_rider_applications(text);

create function public.fetch_rider_applications(
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
  applicant_user_id uuid,
  waiting_days integer
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    a.id, a.status, a.full_name, a.phone, a.city, a.vehicle,
    a.licence_ref, a.orcr_ref, a.government_id_ref,
    a.decision_note, a.created_at, a.reviewed_at,
    coalesce(u.email, '(none)') as applicant_email,
    a.user_id as applicant_user_id,
    greatest(
      0,
      floor(extract(epoch from (now() - a.created_at)) / 86400)
    )::integer as waiting_days
  from rider_applications a
  left join auth.users u on u.id = a.user_id
  where public.is_platform_admin()
    and (p_status is null or a.status::text = p_status)
  order by case when a.status = 'pending' then 0 else 1 end,
           -- Oldest pending first: an unreviewed application is the only thing
           -- in this table that ages, so it belongs at the top of the queue
           -- regardless of when the reviewed ones arrived.
           case when a.status = 'pending' then a.created_at end asc,
           a.created_at desc
  limit 200;
$$;

comment on function public.fetch_rider_applications is
  'Admin queue of rider applications with a waiting_days count, pending oldest-first. No-op (empty) for non-admins via is_platform_admin().';

grant execute on function public.fetch_rider_applications(text) to authenticated;