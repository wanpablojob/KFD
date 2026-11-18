-- --------------------------------------------------------------------------
-- 0155: riders may cancel two jobs a day; every cancellation is recorded
--
-- Panel feedback: track how often each rider cancels, warn on the 1st and 2nd,
-- and block the 3rd. A "cancellation" is giving up a job the rider already
-- took:
--   * "Can't deliver" on a single order (rider_report_failed_delivery),
--   * "Report a problem" on a trip (rider_report_failed_delivery_trip),
--   * releasing a pabakal (rider_release_pabakal).
-- Declining an offer is not one: the rider never took the job.
--
-- All three paths clear the rider from the row they gave up, so one BEFORE
-- trigger per table recognises the change, refuses it once the rider has used
-- today's allowance, and otherwise records it. The three functions are not
-- rebuilt, and an admin moving work around never counts against a rider.
-- "Today" is the calendar day in the Philippines.
-- --------------------------------------------------------------------------

create table if not exists public.rider_cancellations (
  id bigint generated always as identity primary key,
  rider_id text not null references public.riders (id) on delete cascade,
  kind text not null check (kind in ('order', 'trip', 'pabakal')),
  reference text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists rider_cancellations_rider_day
  on public.rider_cancellations (rider_id, created_at desc);

comment on table public.rider_cancellations is
  'Every job a rider gave up after taking it (0155). Read through rider_cancellation_status() and admin_rider_cancellations().';

alter table public.rider_cancellations enable row level security;
revoke all on table public.rider_cancellations from anon, authenticated;

-- The one definition of the daily allowance.
create or replace function public.rider_daily_cancel_limit()
returns integer
language sql
immutable
set search_path = public
as $$ select 2; $$;

revoke all on function public.rider_daily_cancel_limit() from public, anon, authenticated;

-- A rider's cancellations since midnight in the Philippines. Internal.
create or replace function public.rider_cancellations_today(p_rider_id text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from rider_cancellations
   where rider_id = p_rider_id
     and created_at >= (date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila');
$$;

revoke all on function public.rider_cancellations_today(text) from public, anon, authenticated;

create or replace function public.rider_cancel_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_reason text;
begin
  -- Only a rider giving the job up: their own row, rider cleared.
  if old.rider_id is null or new.rider_id is not null then
    return new;
  end if;

  if tg_table_name = 'orders' then
    -- A trip's shop orders are counted once, as the trip.
    if new.delivery_id is not null
       or new.delivery_failed_at is not distinct from old.delivery_failed_at then
      return new;
    end if;
    v_kind := 'order';
    v_reason := new.delivery_failed_reason;
  elsif tg_table_name = 'deliveries' then
    if new.delivery_failed_at is not distinct from old.delivery_failed_at then
      return new;
    end if;
    v_kind := 'trip';
    v_reason := new.delivery_failed_reason;
  else
    -- pabakal_requests: the rider's own release back to open.
    if not (old.status = 'accepted' and new.status = 'open'
            and public.current_rider_id() is not distinct from old.rider_id) then
      return new;
    end if;
    v_kind := 'pabakal';
    v_reason := null;
  end if;

  -- Serialise this rider's cancellations so two at once cannot both pass.
  perform 1 from riders where id = old.rider_id for update;

  if public.rider_cancellations_today(old.rider_id) >= public.rider_daily_cancel_limit() then
    raise exception 'You have already cancelled % jobs today, the most allowed. Contact Meriendash support if you cannot finish this one.',
      public.rider_daily_cancel_limit()
      using errcode = 'P0001';
  end if;

  insert into rider_cancellations (rider_id, kind, reference, reason)
  values (old.rider_id, v_kind, old.reference, v_reason);
  return new;
end;
$$;

revoke all on function public.rider_cancel_guard() from public, anon, authenticated;

drop trigger if exists rider_cancel_guard on public.orders;
create trigger rider_cancel_guard before update of rider_id on public.orders
  for each row execute function public.rider_cancel_guard();
drop trigger if exists rider_cancel_guard on public.deliveries;
create trigger rider_cancel_guard before update of rider_id on public.deliveries
  for each row execute function public.rider_cancel_guard();
drop trigger if exists rider_cancel_guard on public.pabakal_requests;
create trigger rider_cancel_guard before update of rider_id on public.pabakal_requests
  for each row execute function public.rider_cancel_guard();

-- The calling rider's allowance, for the warnings and the disabled button.
create or replace function public.rider_cancellation_status()
returns table (used integer, daily_limit integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rider text := public.current_rider_id();
begin
  if v_rider is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;
  return query select public.rider_cancellations_today(v_rider), public.rider_daily_cancel_limit();
end;
$$;

revoke all on function public.rider_cancellation_status() from public, anon;
grant execute on function public.rider_cancellation_status() to authenticated;

-- Every cancellation in the last p_days days, newest first. Admins only.
create or replace function public.admin_rider_cancellations(p_days integer default 7)
returns table (
  rider_id text,
  rider_name text,
  kind text,
  reference text,
  reason text,
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
    select c.rider_id, r.name, c.kind, c.reference, c.reason, c.created_at
      from rider_cancellations c
      join riders r on r.id = c.rider_id
     where c.created_at >= now() - make_interval(days => greatest(coalesce(p_days, 7), 1))
     order by c.created_at desc;
end;
$$;

revoke all on function public.admin_rider_cancellations(integer) from public, anon;
grant execute on function public.admin_rider_cancellations(integer) to authenticated;
