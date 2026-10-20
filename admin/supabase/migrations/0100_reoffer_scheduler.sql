-- --------------------------------------------------------------------------
-- 0100: a scheduler that re-offers what nobody took, and tells the riders
-- --------------------------------------------------------------------------
--
-- An offer lives five minutes. When it lapses, nothing happened: the order
-- stayed confirmed with no rider, and the only way it was offered again was
-- an admin pressing Re-offer. 0085 says so in as many words: "There is still
-- no scheduler, so offers that expire unclaimed are not re-sent by
-- themselves."
--
-- This adds the scheduler. Every minute the database looks for orders and
-- trips that are confirmed, have no rider, and whose offers have all lapsed,
-- and offers them again -- to the same riders (a decline sticks, and a rider
-- who is already carrying work is skipped). The riders are told: a push
-- cannot come from a trigger, so the offers that need one are queued in the
-- database and the portal sends them.
--
-- The push needs a door, and the door needs to be one only the database can
-- open. Every queued row carries a token; the portal accepts a request that
-- carries a token it finds in the queue, and it sends every unsent row. The
-- token is not a password: it authorises "send the queued offer pushes" and
-- nothing else, and it is worthless once the queue is empty.
--
-- The re-offer after a failed delivery goes the same way. The acceptance
-- trigger re-offers an order a rider gave up on, and nobody pushed that
-- either; now it queues the same push.
--
-- The merchant's own acceptance still pushes from the portal, which knows it
-- happened, so the queue is not used there: a rider gets one push, not two.
-- --------------------------------------------------------------------------

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- --------------------------------------------------------------------------
-- The queue of pushes the database wants sent
-- --------------------------------------------------------------------------

create table if not exists public.reoffer_push_queue (
  id bigint generated always as identity primary key,
  -- A single order, or a trip. Exactly one of the two is set.
  order_id text,
  delivery_id text,
  rider_id text not null references public.riders (id) on delete cascade,
  -- Proof that the request to send them came from here.
  token uuid not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists reoffer_push_queue_unsent
  on public.reoffer_push_queue (created_at)
  where sent_at is null;

alter table public.reoffer_push_queue enable row level security;
revoke all on public.reoffer_push_queue from public, anon, authenticated;

-- The one-argument version is replaced by the one below, which takes the push
-- flag with a default, so every existing call still resolves.
drop function if exists public.offer_order_to_riders(text);

-- Rebuilt from the live definition (0085), with the push queue added.
create or replace function public.offer_order_to_riders(
  p_order_id text,
  -- 0099: queue a push for the riders this offer reached. The merchant's
  -- acceptance is pushed by the portal, which knows it happened; an offer
  -- nobody saw has to be pushed from here.
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
     -- A failed delivery returns to 'confirmed' and is re-offered by this same
     -- trigger; the rider who just gave up on it is not asked again.
     and d.id is distinct from v_failed_by
     -- One delivery at a time: a rider already carrying an order is skipped.
     and not exists (
       select 1 from orders c
        where c.rider_id = d.id
          and c.status in ('confirmed', 'preparing', 'out_for_delivery')
     )
     and not exists (
       select 1 from order_offers f
        where f.order_id = p_order_id
          and f.rider_id = d.id
          and f.status = 'declined'
     )
  on conflict (order_id, rider_id) where status = 'offered'
  do update set expires_at = excluded.expires_at;

  get diagnostics v_count = row_count;

  -- The riders this call reached, for the push. The rows it created have
  -- offered_at = now(); the ones it only extended kept the offered_at they
  -- had, so the difference is exactly who was newly offered.
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

drop function if exists public.offer_delivery_to_riders(text);

-- Rebuilt from the live definition (0092), with the push queue added.
create or replace function public.offer_delivery_to_riders(
  p_delivery_id text,
  -- 0099: queue a push for the riders this offer reached.
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
     -- One trip at a time: a rider already carrying a trip is skipped.
     and not exists (
       select 1 from public.deliveries c
        where c.rider_id = r.id
          and c.status in ('confirmed', 'preparing', 'out_for_delivery')
     )
     -- Declines stick.
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

-- Rebuilt from the live definition (0092): a failed delivery now queues its
-- push. The 0092 rule -- a part of a trip is offered with the trip, not on
-- its own -- is kept: it is what keeps a shop's food from being offered to
-- two riders at once.
create or replace function public.orders_auto_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed'
     and old.status is distinct from 'confirmed'
     and new.rider_id is null
     -- A part of a trip is offered with the trip (0090), not on its own.
     and new.delivery_id is null then
    -- A rider reporting a failed delivery puts the order back to 'confirmed',
    -- and the same trigger re-offers it. Nobody pushes that re-offer today
    -- (0100): the rider only finds out by opening the app.
    perform public.offer_order_to_riders(new.id, new.delivery_failed_by is not null);
  end if;
  return null;
end;
$$;


-- --------------------------------------------------------------------------
-- The scheduler
-- --------------------------------------------------------------------------

-- Re-offer what lapsed, and queue the push for the riders it reached.
create or replace function public.reoffer_lapsed_offers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  perform public.expire_stale_offers();

  -- A single order: confirmed, no rider, every offer lapsed.
  for v_row in
    select o.id
      from public.orders o
     where o.rider_id is null
       and o.status in ('confirmed', 'preparing')
       and exists (
         select 1 from public.order_offers f
          where f.order_id = o.id
            and f.status = 'expired'
       )
       and not exists (
         select 1 from public.order_offers f
          where f.order_id = o.id
            and f.status = 'offered'
            and f.expires_at > now()
       )
  loop
    perform public.offer_order_to_riders(v_row.id, true);
    v_count := v_count + 1;
  end loop;

  -- A trip: the same rule, across the shops in it.
  for v_row in
    select d.id
      from public.deliveries d
     where d.rider_id is null
       and d.status in ('confirmed', 'preparing')
       and exists (
         select 1 from public.delivery_offers f
          where f.delivery_id = d.id
            and f.status = 'expired'
       )
       and not exists (
         select 1 from public.delivery_offers f
          where f.delivery_id = d.id
            and f.status = 'offered'
            and f.expires_at > now()
       )
  loop
    perform public.offer_delivery_to_riders(v_row.id, true);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.reoffer_lapsed_offers() is
  'Re-offer the orders and trips whose offers lapsed, and queue the push for the riders they were offered to. Called every minute by pg_cron.';

revoke all on function public.reoffer_lapsed_offers() from public, anon, authenticated;

-- Ask the portal to send the queued pushes. pg_net hands the request to the
-- database's own worker, so this returns before the portal has answered.
create or replace function public.push_queued_offers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_count integer;
  -- The same host the store listing points at. It has to be the public site:
  -- the portal that holds the push credentials is the one the riders are
  -- told about.
  v_url text := 'https://kfd-one.vercel.app/api/dispatch/push-offers';
begin
  select count(*) into v_count
    from public.reoffer_push_queue
   where sent_at is null;

  if v_count = 0 then
    return 0;
  end if;

  -- Any token that is still waiting proves the request came from here.
  select token into v_token
    from public.reoffer_push_queue
   where sent_at is null
   group by token
   order by min(created_at)
   limit 1;

  perform extensions.net.http_post(
    url := v_url,
    body := jsonb_build_object('token', v_token),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-scheduler-token', v_token::text
    ),
    timeout_milliseconds := 5000
  );

  return v_count;
end;
$$;

comment on function public.push_queued_offers() is
  'Ask the admin portal to send the queued offer pushes. The request carries a token from the queue, which is the only proof the database wants the pushes sent.';

revoke all on function public.push_queued_offers() from public, anon, authenticated;

-- The job itself. Every minute: re-offer what lapsed, then tell the riders.
do $$
declare
  v_jobid bigint;
begin
  for v_jobid in
    select jobid from cron.job where jobname = 'reoffer-lapsed-offers'
  loop
    perform cron.unschedule(v_jobid);
  end loop;
end $$;

select cron.schedule(
  'reoffer-lapsed-offers',
  '* * * * *',
  $job$
    select public.reoffer_lapsed_offers();
    select public.push_queued_offers();
  $job$
);

comment on function public.offer_order_to_riders(text, boolean) is
  'Offer an accepted order to every eligible rider in its city for 5 minutes. Internal: called by the acceptance trigger and by the scheduler (0100); admins use admin_dispatch_order (0085).';

revoke all on function public.offer_order_to_riders(text, boolean) from public, anon, authenticated;

comment on function public.offer_delivery_to_riders(text, boolean) is
  'Offer a trip to every eligible rider in its city for 5 minutes, once every shop in it has accepted (0090). Internal: called by the scheduler (0100).';

revoke all on function public.offer_delivery_to_riders(text, boolean) from public, anon, authenticated;
