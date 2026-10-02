-- --------------------------------------------------------------------------
-- Dispatch: offers, an available-jobs feed, and an atomic claim
--
-- The rider app was mechanically complete and functionally empty. Not for want
-- of plumbing -- fetch_rider_orders_page paginates, rider_set_status toggles
-- availability, the availability toggle exists in the rider surface. The reason
-- it had nothing to show is that nothing could ever assign a rider to an order.
-- The only write of orders.rider_id in the entire schema was the one-time
-- name-matching backfill in 0025, so `where o.rider_id = v_rider_id` could not
-- match an order that did not exist yet.
--
-- Why a queue rather than auto-assign: `riders` has no location column, so
-- "nearest rider" would be a fiction. A rider claims their own work, which is
-- also the shape riders already expect from delivery apps.
--
-- Two decisions taken with the product owner before writing this:
--
--   * An offer is claimable for 5 minutes. Long enough for a rider finishing the
--     previous drop to look up, short enough that the food is still fresh.
--   * A declined offer returns the order to the pool for other riders. It stays
--     in the admin's unassigned list rather than going nowhere, and it is not
--     auto-expired into limbo. Riders who already declined a given order are not
--     re-offered it.
--
-- Invariant this file exists to establish: orders.rider_id is the source of
-- truth for assignment. The free-text orders.rider is a display mirror that
-- admin/src/lib/supabase/queries.ts still selects and filters on
-- (fetchOrdersByRider); it is written in the same statement as rider_id so the
-- two cannot disagree, and nothing is ever assigned by writing that text alone.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- order_offers
-- --------------------------------------------------------------------------

do $$ begin
  create type offer_status as enum ('offered', 'claimed', 'declined', 'expired');
exception when duplicate_object then null;
end $$;

create table if not exists order_offers (
  id bigint generated always as identity primary key,
  order_id text not null references orders(id) on delete cascade,
  rider_id text not null references riders(id) on delete cascade,
  status offer_status not null default 'offered',
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  decline_reason text
);

comment on table order_offers is
  'Delivery offers: which rider was asked to take which order. History is kept (claimed/declined/expired rows) so "who turned this down" is answerable later. No direct client access; all reads and writes go through the RPCs below.';

-- At most one *live* offer per order/rider pair. Partial rather than a plain
-- unique constraint so the decline history survives: a rider who declined can
-- be offered again later, and both attempts are still on record.
create unique index if not exists order_offers_live_uniq
  on order_offers (order_id, rider_id)
  where status = 'offered';

-- The rider feed: "my live offers", so this is the hot path.
create index if not exists order_offers_rider_status_idx
  on order_offers (rider_id, status, expires_at);

-- The admin pool: "which orders have no rider yet".
create index if not exists order_offers_order_idx
  on order_offers (order_id);

alter table order_offers enable row level security;

-- Same posture as leads (0032): RLS with no policies, and the table grants
-- revoked, so no browser can read or forge an offer directly. The RPCs below
-- are the only door.
revoke all on table order_offers from anon;
revoke all on table order_offers from authenticated;
grant all on table order_offers to service_role;


-- --------------------------------------------------------------------------
-- Shared helpers
-- --------------------------------------------------------------------------

-- Riders are addressed by auth.uid() throughout, never by a rider id supplied
-- by the caller. claim_order is where this matters most: a client that could
-- name its own rider_id could claim as any rider.
create or replace function public.current_rider_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.id from riders r where r.user_id = auth.uid() limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from app_users where user_id = auth.uid() and role = 'admin'
  );
$$;

comment on function public.current_rider_id() is
  'The rider_id of the calling user, or null. Used to enforce "riders act as themselves".';
comment on function public.is_admin() is
  'True when the caller has the admin role. Used by the dispatch surface.';

revoke all on function public.current_rider_id() from public;
revoke all on function public.current_rider_id() from anon;
grant execute on function public.current_rider_id() to authenticated;

revoke all on function public.is_admin() from public;
revoke all on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

-- Offers past their window are marked expired rather than left 'offered'
-- forever. Called opportunistically at the head of every function that reads
-- offers, so there is no cron dependency and no stale claim can be made.
create or replace function public.expire_stale_offers()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update order_offers
     set status = 'expired'
   where status = 'offered'
     and expires_at <= now();
end;
$$;

comment on function public.expire_stale_offers() is
  'Marks timed-out offers expired. Invoked by the RPCs that read offers; there is deliberately no scheduler dependency.';

revoke all on function public.expire_stale_offers() from public;
revoke all on function public.expire_stale_offers() from anon;


-- --------------------------------------------------------------------------
-- Rider side: the feed and the claim
-- --------------------------------------------------------------------------

-- What the rider can pick up right now. Shows the destination because deciding
-- to take a job is easier when you know where it goes; Phase 2 is about the
-- assigned-order card, not this feed.
create or replace function public.available_jobs()
returns table (
  order_id text,
  reference text,
  restaurant text,
  city text,
  delivery_address text,
  items jsonb,
  total numeric,
  payment payment_method,
  placed_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rider_id text;
begin
  perform public.expire_stale_offers();

  v_rider_id := public.current_rider_id();
  if v_rider_id is null then
    raise exception 'Your account is not linked to a rider.' using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.reference,
    o.restaurant,
    r.city,
    o.delivery_address,
    o.items,
    o.total,
    o.payment,
    o.placed_at,
    f.expires_at
  from order_offers f
  join orders o   on o.id = f.order_id
  join restaurants r on r.id = o.restaurant_id
  where f.rider_id = v_rider_id
    and f.status = 'offered'
    and f.expires_at > now()
    -- An order someone already claimed must never appear as claimable, even if
    -- this rider's own offer has not been swept to 'expired' yet.
    and o.rider_id is null
    and o.status in ('pending', 'confirmed')
  order by o.placed_at;
end;
$$;

comment on function public.available_jobs() is
  'Live delivery offers for the calling rider, destination included. Only ever returns offers that are unclaimed and unexpired.';

revoke all on function public.available_jobs() from public;
revoke all on function public.available_jobs() from anon;
grant execute on function public.available_jobs() to authenticated;

-- The one place orders.rider_id is written.
--
-- Atomicity is the whole point and rests on a single predicate: the UPDATE
-- carries `and rider_id is null`. Two riders claiming the same order both reach
-- that UPDATE; the row lock serialises them; the loser matches zero rows and
-- raises. There is no read-then-write window and no advisory lock to leak.
--
-- The caller must already hold a live offer, which is what stops a rider from
-- claiming an order they were never offered simply by guessing its id.
create or replace function public.claim_order(p_order_id text)
returns table (
  order_id text,
  reference text,
  restaurant text,
  delivery_address text,
  items jsonb,
  total numeric,
  payment payment_method,
  placed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider_id text;
  v_rider_name text;
begin
  perform public.expire_stale_offers();

  select r.id, r.name into v_rider_id, v_rider_name
    from riders r where r.user_id = auth.uid();

  if v_rider_id is null then
    raise exception 'Your account is not linked to a rider.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from order_offers f
     where f.order_id = p_order_id
       and f.rider_id = v_rider_id
       and f.status = 'offered'
       and f.expires_at > now()
  ) then
    raise exception 'That delivery is no longer available.' using errcode = '40001';
  end if;

  update orders o
     set rider_id = v_rider_id,
         -- Display mirror for admin (queries.ts still selects orders.rider).
         -- Written here and nowhere else; rider_id remains the source of truth.
         rider = v_rider_name
   where o.id = p_order_id
     and o.rider_id is null
     and o.status in ('pending', 'confirmed')
  returning o.id, o.reference, o.restaurant, o.delivery_address,
            o.items, o.total, o.payment, o.placed_at
    into order_id, reference, restaurant, delivery_address,
         items, total, payment, placed_at;

  if order_id is null then
    raise exception 'Someone else already took this delivery.' using errcode = '40001';
  end if;

  update order_offers
     set status = 'claimed', claimed_at = now()
   where order_id = p_order_id
     and rider_id = v_rider_id
     and status = 'offered';

  -- Everyone else's live offer for this order is now moot.
  update order_offers
     set status = 'expired'
   where order_id = p_order_id
     and status = 'offered'
     and rider_id <> v_rider_id;

  return next;
end;
$$;

comment on function public.claim_order(text) is
  'Atomically claims an offered delivery for the calling rider and assigns orders.rider_id. Exactly one rider can win a contested claim.';

revoke all on function public.claim_order(text) from public;
revoke all on function public.claim_order(text) from anon;
grant execute on function public.claim_order(text) to authenticated;

-- Decline returns the order to the pool. The order itself is untouched: it has
-- no rider, so it stays visible in the admin unassigned list and can be
-- offered to other riders. Nothing expires the order as a side effect.
create or replace function public.decline_order(
  p_order_id text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider_id text;
begin
  perform public.expire_stale_offers();

  v_rider_id := public.current_rider_id();
  if v_rider_id is null then
    raise exception 'Your account is not linked to a rider.' using errcode = '42501';
  end if;

  update order_offers
     set status = 'declined',
         decline_reason = nullif(btrim(p_reason), '')
   where order_id = p_order_id
     and rider_id = v_rider_id
     and status = 'offered';

  if not found then
    raise exception 'That delivery is no longer available.' using errcode = '40001';
  end if;
end;
$$;

comment on function public.decline_order(text, text) is
  'Declines a delivery offer. The order returns to the pool unassigned rather than expiring.';

revoke all on function public.decline_order(text, text) from public;
revoke all on function public.decline_order(text, text) from anon;
grant execute on function public.decline_order(text, text) to authenticated;


-- --------------------------------------------------------------------------
-- Admin side: the dispatch surface
-- --------------------------------------------------------------------------

-- Unassigned orders awaiting a rider. Deliberately does not auto-expire or
-- auto-cancel: an order nobody claimed is still an order a customer is waiting
-- on, so it stays here until a human deals with it.
create or replace function public.dispatch_unassigned_orders()
returns table (
  order_id text,
  reference text,
  customer text,
  restaurant text,
  restaurant_id text,
  city text,
  delivery_address text,
  items jsonb,
  total numeric,
  status order_status,
  placed_at timestamptz,
  live_offers integer,
  offers_made integer,
  declines integer,
  online_riders_in_city integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.reference,
    o.customer,
    o.restaurant,
    o.restaurant_id,
    r.city,
    o.delivery_address,
    o.items,
    o.total,
    o.status,
    o.placed_at,
    (select count(*)::int from order_offers f
      where f.order_id = o.id and f.status = 'offered' and f.expires_at > now()),
    (select count(*)::int from order_offers f where f.order_id = o.id),
    (select count(*)::int from order_offers f
      where f.order_id = o.id and f.status = 'declined'),
    (select count(*)::int from riders d
      where d.city = r.city and d.status = 'online')
  from orders o
  join restaurants r on r.id = o.restaurant_id
  where o.rider_id is null
    and o.status in ('pending', 'confirmed')
  order by o.placed_at;
end;
$$;

comment on function public.dispatch_unassigned_orders() is
  'Orders with no rider yet, for the admin dispatch list. Admins only. Nothing here expires an order automatically.';

revoke all on function public.dispatch_unassigned_orders() from public;
revoke all on function public.dispatch_unassigned_orders() from anon;
grant execute on function public.dispatch_unassigned_orders() to authenticated;

create or replace function public.dispatch_riders()
returns table (
  rider_id text,
  name text,
  phone text,
  city text,
  vehicle vehicle_type,
  status rider_status,
  deliveries integer,
  rating numeric,
  active_offers integer,
  claimed_today integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  return query
  select
    d.id,
    d.name,
    d.phone,
    d.city,
    d.vehicle,
    d.status,
    d.deliveries,
    d.rating,
    (select count(*)::int from order_offers f
      where f.rider_id = d.id and f.status = 'offered' and f.expires_at > now()),
    (select count(*)::int from orders o
      where o.rider_id = d.id
        and o.status not in ('delivered', 'cancelled')
        and o.placed_at >= date_trunc('day', now()))
  from riders d
  order by (d.status = 'online') desc, d.name;
end;
$$;

comment on function public.dispatch_riders() is
  'Riders with live offer and workload counts, for the admin dispatch list. Admins only.';

revoke all on function public.dispatch_riders() from public;
revoke all on function public.dispatch_riders() from anon;
grant execute on function public.dispatch_riders() to authenticated;

-- Pushes offers out. p_rider_ids omitted means "every online rider in the
-- restaurant's city", which is the normal dispatch path; passing explicit ids
-- is for targeting one rider from the admin list.
--
-- Riders who already declined this order are skipped. Re-running the dispatch
-- on an order with live offers refreshes their 5-minute window rather than
-- duplicating rows.
create or replace function public.admin_dispatch_order(
  p_order_id text,
  p_rider_ids text[] default null
)
returns table (order_id text, offered_to integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city text;
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  perform public.expire_stale_offers();

  select r.city into v_city
    from orders o
    join restaurants r on r.id = o.restaurant_id
   where o.id = p_order_id
     and o.rider_id is null
     and o.status in ('pending', 'confirmed');

  if v_city is null then
    raise exception 'That order is not available for dispatch. It may already have a rider.' using errcode = '22023';
  end if;

  insert into order_offers (order_id, rider_id, status, expires_at)
  select p_order_id, d.id, 'offered', now() + interval '5 minutes'
    from riders d
   where (
          (p_rider_ids is null and d.city = v_city)
          or (p_rider_ids is not null and d.id = any (p_rider_ids))
        )
     and d.status = 'online'
     -- Declines stick: a rider who turned this order down is not asked again.
     and not exists (
       select 1 from order_offers f
        where f.order_id = p_order_id
          and f.rider_id = d.id
          and f.status = 'declined'
     )
  on conflict (order_id, rider_id) where status = 'offered'
  do update set expires_at = excluded.expires_at;

  get diagnostics v_count = row_count;

  order_id := p_order_id;
  offered_to := v_count;
  return next;
end;
$$;

comment on function public.admin_dispatch_order(text, text[]) is
  'Offers an unassigned order to online riders in the restaurant city, or to explicit rider ids. Admins only. Offers live for 5 minutes.';

revoke all on function public.admin_dispatch_order(text, text[]) from public;
revoke all on function public.admin_dispatch_order(text, text[]) from anon;
grant execute on function public.admin_dispatch_order(text, text[]) to authenticated;