-- --------------------------------------------------------------------------
-- 0149: an order with a rider that stops moving is noticed, and the rider keeps
-- the mark
--
-- If a rider's phone dies the order stays `out_for_delivery` forever. The
-- customer waits, the tracker keeps saying "on the way", no screen in the admin
-- says anything is wrong, and the rider's record stays clean because nothing
-- was ever recorded. `expire_open_pabakal` (0136) covers pabakal requests; this
-- is the orders equivalent.
--
-- A pg_cron sweep every five minutes writes one row per stalled order into
-- `order_stalls`. The row keeps the rider who held the order *when it stalled*,
-- so reassigning the order does not erase the incident: the mark stays with
-- whoever left it, which is what makes it useful for rider performance.
-- When the order moves on (delivered, cancelled, back to the pool) the row is
-- closed with `cleared_at` and kept as history.
--
-- "Stalled" means: the order still has a rider on it (preparing or
-- out_for_delivery) and nothing has happened for STALL_MINUTES. This schema has
-- no picked-up timestamp, so the clock is the last known progress -- the later
-- of when the order was placed and when the kitchen marked it ready (0146).
-- That can only understate a stall, never invent one.
--
-- A basket from several shops is several orders on one trip, so it stalls as
-- several rows. The admin's rider reliability figure counts distinct trips, not
-- rows, so one dead phone is one incident there.
-- --------------------------------------------------------------------------

create table if not exists public.order_stalls (
  id bigserial primary key,
  order_id text not null references public.orders (id) on delete cascade,
  delivery_id text,
  rider_id text references public.riders (id) on delete set null,
  stage public.order_status not null,
  stall_since timestamptz not null,
  detected_at timestamptz not null default now(),
  minutes_stalled integer not null default 0,
  cleared_at timestamptz
);

comment on table public.order_stalls is
  'One row per order that stopped moving while a rider had it (0149). Written by sweep_stalled_orders(), closed -- never deleted -- when the order moves on. rider_id is who held it at the moment it stalled.';

-- At most one open stall per order; history rows are unbounded.
create unique index if not exists order_stalls_open_uniq
  on public.order_stalls (order_id)
  where cleared_at is null;

create index if not exists order_stalls_rider_idx
  on public.order_stalls (rider_id, detected_at desc);

create index if not exists order_stalls_open_idx
  on public.order_stalls (detected_at desc)
  where cleared_at is null;

alter table public.order_stalls enable row level security;

-- Read-only for admins: a stall is evidence of what happened, and the only
-- writer is sweep_stalled_orders(), which runs as definer. Letting a client
-- rewrite a stall would let it rewrite the rider's record.
drop policy if exists "authenticated read: order_stalls" on public.order_stalls;
create policy "authenticated read: order_stalls"
  on public.order_stalls for select
  to authenticated
  using (true);

-- Supabase's default privileges grant ALL on a new table in public to both
-- client roles (0088 withdrew them one table at a time, so a table created
-- afterwards needs its own withdraw). TRUNCATE is not filtered by RLS, so the
-- grant alone would empty the table past every policy.
revoke all on table public.order_stalls from anon, authenticated;
grant select on table public.order_stalls to authenticated;


create or replace function public.sweep_stalled_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Keep in step with STALL_MINUTES in admin/src/lib/stuck-orders.ts, which
  -- only labels what this function has already decided.
  v_minutes constant integer := 45;
  v_active integer;
begin
  -- Close first, so the number this returns is only what is stuck right now.
  -- An order that went back to the pool, was reassigned, or finished is no
  -- longer stalled; the row stays as history with cleared_at set, still
  -- attributed to the rider who had it. Reassigning is movement: somebody
  -- acted, so the order is no longer invisible, and the mark on the original
  -- rider is already recorded.
  update order_stalls s
     set cleared_at = now()
   where s.cleared_at is null
     and not exists (
       select 1
         from orders o
        where o.id = s.order_id
          and o.status in ('preparing', 'out_for_delivery')
          and o.rider_id is not null
          and o.delivery_failed_at is null
          and o.rider_id = s.rider_id
     );

  -- The clock for each order: the last moment anybody is known to have moved
  -- it. That is the later of when it was placed and when the kitchen marked it
  -- ready, and -- when a different rider took it over -- the moment the
  -- handover was noticed. The handover matters: a rider who picks up an
  -- order that has already been sitting for two hours has not made it wait,
  -- and must not be charged for the wait that happened before they arrived.
  with candidates as (
    select o.id,
           o.delivery_id,
           o.rider_id,
           o.status,
           greatest(
             o.placed_at,
             coalesce(o.ready_for_pickup_at, o.placed_at),
             coalesce(
               (select max(s2.cleared_at)
                  from order_stalls s2
                 where s2.order_id = o.id
                   and s2.rider_id is distinct from o.rider_id),
               o.placed_at
             )
           ) as since
      from orders o
     where o.status in ('preparing', 'out_for_delivery')
       and o.rider_id is not null
       and o.delivery_failed_at is null
  )
  insert into order_stalls (order_id, delivery_id, rider_id, stage, stall_since, minutes_stalled)
  select id,
         delivery_id,
         rider_id,
         status,
         since,
         (extract(epoch from (now() - since)) / 60)::int
    from candidates
   where since < now() - make_interval(mins => v_minutes)
  on conflict (order_id) where cleared_at is null do update
     set stage = excluded.stage,
         minutes_stalled = excluded.minutes_stalled,
         delivery_id = excluded.delivery_id,
         -- The rider who had it when it stalled keeps the mark. A reassignment
         -- must not launder the incident.
         rider_id = coalesce(order_stalls.rider_id, excluded.rider_id);

  select count(*)::int into v_active
    from order_stalls
   where cleared_at is null;

  return v_active;
end;
$$;

comment on function public.sweep_stalled_orders()
  is 'Flags orders that have stopped moving with a rider and closes stalls that resolved (0149). Returns the number of orders stalled right now. Run every five minutes by pg_cron.';
revoke all on function public.sweep_stalled_orders() from public, anon, authenticated;


do $$
declare
  v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname = 'sweep-stalled-orders' loop
    perform cron.unschedule(v_jobid);
  end loop;
end $$;

select cron.schedule(
  'sweep-stalled-orders',
  '*/5 * * * *',
  $job$
    select public.sweep_stalled_orders();
  $job$
);
