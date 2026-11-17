-- --------------------------------------------------------------------------
-- 0148: a rider carries up to two jobs, and is Busy while they do
--
-- Until now a rider carrying anything was skipped by dispatch: one job at a
-- time. Riders here can carry two (an order and another on the same road), so
-- the limit is two, and the rider's status says so on its own:
--
--   * The second job makes an online rider Busy, and their other live offers
--     lapse, so nothing more comes up for them.
--   * Finishing, failing or giving up a job drops them below two, and a rider
--     the system made Busy goes back Online.
--   * A rider who chose Busy or Offline themselves is left alone: only a Busy
--     the system set is undone by the system. riders.auto_busy remembers which.
--
-- A "job" is a single order, a trip (its shop orders count once, as the
-- trip), or a pabakal. The cap is enforced where a job is taken, by a trigger
-- on the row, so claim_order, claim_delivery, rider_claim_pabakal and an
-- admin's manual assignment all obey it without each being rebuilt.
-- --------------------------------------------------------------------------

alter table public.riders
  add column if not exists auto_busy boolean not null default false;

comment on column public.riders.auto_busy is
  'True when status = busy was set by the system because the rider carries two jobs (0148). Cleared by any status change a person makes.';

-- How many jobs a rider has in hand.
create or replace function public.rider_active_jobs(p_rider_id text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (
    (select count(*) from orders
      where rider_id = p_rider_id and delivery_id is null
        and status in ('confirmed', 'preparing', 'out_for_delivery'))
  + (select count(*) from deliveries
      where rider_id = p_rider_id
        and status in ('confirmed', 'preparing', 'out_for_delivery'))
  + (select count(*) from pabakal_requests
      where rider_id = p_rider_id and status in ('accepted', 'delivering'))
  )::integer;
$$;

revoke all on function public.rider_active_jobs(text) from public, anon, authenticated;

-- Busy at two, back Online below two (only if the system made them Busy).
create or replace function public.sync_rider_busy(p_rider_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_rider_id is null then
    return;
  end if;

  if public.rider_active_jobs(p_rider_id) >= 2 then
    update riders set status = 'busy', auto_busy = true
     where id = p_rider_id and status = 'online';

    -- Their other live offers lapse. The job they just took keeps its offer
    -- row: claim_order marks it claimed after this runs.
    update order_offers f set status = 'expired'
     where f.rider_id = p_rider_id and f.status = 'offered'
       and not exists (select 1 from orders o where o.id = f.order_id and o.rider_id = p_rider_id);
    update delivery_offers f set status = 'expired'
     where f.rider_id = p_rider_id and f.status = 'offered'
       and not exists (select 1 from deliveries d where d.id = f.delivery_id and d.rider_id = p_rider_id);
  else
    update riders set status = 'online', auto_busy = false
     where id = p_rider_id and status = 'busy' and auto_busy;
  end if;
end;
$$;

revoke all on function public.sync_rider_busy(text) from public, anon, authenticated;

-- Refuse a third job, whoever assigns it.
create or replace function public.rider_job_cap_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rider_id is null
     or (tg_op = 'UPDATE' and new.rider_id is not distinct from old.rider_id) then
    return new;
  end if;
  -- A shop order inside a trip is counted as the trip. Nested, not or-ed:
  -- deliveries and pabakal_requests have no delivery_id to read.
  if tg_table_name = 'orders' then
    if new.delivery_id is not null then
      return new;
    end if;
  end if;

  -- Two claims by the same rider at once would both count one job.
  perform 1 from riders where id = new.rider_id for update;

  if public.rider_active_jobs(new.rider_id) >= 2 then
    raise exception 'You already have 2 deliveries. Finish one before taking another.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.rider_job_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' then
    perform public.sync_rider_busy(old.rider_id);
  end if;
  if tg_op <> 'DELETE' and new.rider_id is distinct from old.rider_id then
    perform public.sync_rider_busy(new.rider_id);
  end if;
  return null;
end;
$$;

-- A person changing the status clears auto_busy; Online while carrying two
-- is held at Busy, so the roster never shows a full rider as available.
create or replace function public.riders_status_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and new.auto_busy is not distinct from old.auto_busy then
    new.auto_busy := false;
    if new.status = 'online' and public.rider_active_jobs(new.id) >= 2 then
      new.status := 'busy';
      new.auto_busy := true;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.rider_job_cap_guard() from public, anon, authenticated;
revoke all on function public.rider_job_sync() from public, anon, authenticated;
revoke all on function public.riders_status_guard() from public, anon, authenticated;

drop trigger if exists rider_job_cap on public.orders;
create trigger rider_job_cap before insert or update of rider_id on public.orders
  for each row execute function public.rider_job_cap_guard();
drop trigger if exists rider_job_cap on public.deliveries;
create trigger rider_job_cap before insert or update of rider_id on public.deliveries
  for each row execute function public.rider_job_cap_guard();
drop trigger if exists rider_job_cap on public.pabakal_requests;
create trigger rider_job_cap before insert or update of rider_id on public.pabakal_requests
  for each row execute function public.rider_job_cap_guard();

drop trigger if exists rider_job_sync on public.orders;
create trigger rider_job_sync after insert or update of rider_id, status or delete on public.orders
  for each row execute function public.rider_job_sync();
drop trigger if exists rider_job_sync on public.deliveries;
create trigger rider_job_sync after insert or update of rider_id, status or delete on public.deliveries
  for each row execute function public.rider_job_sync();
drop trigger if exists rider_job_sync on public.pabakal_requests;
create trigger rider_job_sync after insert or update of rider_id, status or delete on public.pabakal_requests
  for each row execute function public.rider_job_sync();

drop trigger if exists riders_status_guard on public.riders;
create trigger riders_status_guard before update of status on public.riders
  for each row execute function public.riders_status_guard();

-- --------------------------------------------------------------------------
-- Dispatch: offer to riders with fewer than two jobs, not to riders with none.
-- Both rebuilt from 0100 with only that filter changed.
-- --------------------------------------------------------------------------

create or replace function public.offer_order_to_riders(
  p_order_id text,
  p_queue_push boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city text;
  v_failed_by text;
  v_count integer;
  v_started timestamptz := now();
  v_token uuid := gen_random_uuid();
begin
  perform public.expire_stale_offers();

  select r.city, o.delivery_failed_by into v_city, v_failed_by
    from orders o
    join restaurants r on r.id = o.restaurant_id
   where o.id = p_order_id
     and o.rider_id is null
     and o.status in ('confirmed', 'preparing');

  if v_city is null then
    return 0;
  end if;

  insert into order_offers (order_id, rider_id, status, expires_at)
  select p_order_id, d.id, 'offered', now() + interval '5 minutes'
    from riders d
   where d.city = v_city
     and d.status = 'online'
     and d.archived_at is null
     and d.suspended_at is null
     and d.id is distinct from v_failed_by
     -- Up to two jobs at a time (0148).
     and public.rider_active_jobs(d.id) < 2
     and not exists (
       select 1 from order_offers f
        where f.order_id = p_order_id
          and f.rider_id = d.id
          and f.status = 'declined'
     )
  on conflict (order_id, rider_id) where status = 'offered'
  do update set expires_at = excluded.expires_at;

  get diagnostics v_count = row_count;

  if p_queue_push then
    insert into public.reoffer_push_queue (order_id, rider_id, token)
    select p_order_id, f.rider_id, v_token
      from public.order_offers f
     where f.order_id = p_order_id
       and f.status = 'offered'
       and f.offered_at >= v_started;
  end if;

  return v_count;
end;
$$;

create or replace function public.offer_delivery_to_riders(
  p_delivery_id text,
  p_queue_push boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city text;
  v_count integer;
  v_started timestamptz := now();
  v_token uuid := gen_random_uuid();
begin
  if not exists (
    select 1 from public.deliveries d
     where d.id = p_delivery_id
       and d.rider_id is null
       and d.status in ('confirmed', 'preparing')
  ) then
    return 0;
  end if;

  select d.city into v_city from public.deliveries d where d.id = p_delivery_id;

  if v_city is null then
    return 0;
  end if;

  insert into public.delivery_offers (delivery_id, rider_id, status, expires_at)
  select p_delivery_id, r.id, 'offered', now() + interval '5 minutes'
    from public.riders r
   where r.city = v_city
     and r.status = 'online'
     and r.archived_at is null
     and r.suspended_at is null
     -- Up to two jobs at a time (0148).
     and public.rider_active_jobs(r.id) < 2
     and not exists (
       select 1 from public.delivery_offers f
        where f.delivery_id = p_delivery_id
          and f.rider_id = r.id
          and f.status = 'declined'
     )
  on conflict (delivery_id, rider_id) where status = 'offered'
  do update set expires_at = excluded.expires_at;

  get diagnostics v_count = row_count;

  if p_queue_push then
    insert into public.reoffer_push_queue (delivery_id, rider_id, token)
    select p_delivery_id, f.rider_id, v_token
      from public.delivery_offers f
     where f.delivery_id = p_delivery_id
       and f.status = 'offered'
       and f.offered_at >= v_started;
  end if;

  return v_count;
end;
$$;

-- Riders already carrying two (an order, a trip and a pabakal were each
-- capped separately before) start out Busy.
select public.sync_rider_busy(id) from public.riders where status = 'online';
