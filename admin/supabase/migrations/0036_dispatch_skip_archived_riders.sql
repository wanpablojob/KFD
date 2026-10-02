-- --------------------------------------------------------------------------
-- 0036: archived riders must not be dispatchable
--
-- 0035 filtered riders on status = 'online' and nothing else. But 0010 gave
-- riders an archived_at column, where NULL means live. An archived rider whose
-- status was left at 'online' was therefore still offered live deliveries, and
-- the admin count overstated who was available.
--
-- Archiving exists precisely to stop someone being handed work, so this is a
-- correctness fix, not a preference. Five places, because 0035 spread the
-- "who can ride" question across them.
--
-- Functions are replaced wholesale rather than altered in place because
-- CREATE OR REPLACE needs the whole body. Return types are unchanged
-- everywhere, so no signature change and no type regeneration is needed.
-- --------------------------------------------------------------------------

-- The single choke point for "who is calling". Excluding archived here is what
-- stops an archived rider from seeing an offer feed at all: available_jobs()
-- raises on a null rider_id, so there is nothing to see.
create or replace function public.current_rider_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.id from riders r
   where r.user_id = auth.uid()
     and r.archived_at is null
   limit 1;
$$;

comment on function public.current_rider_id() is
  'The rider_id of the calling user, or null. Archived riders resolve to null. Used to enforce "riders act as themselves".';

revoke all on function public.current_rider_id() from public;
revoke all on function public.current_rider_id() from anon;
grant execute on function public.current_rider_id() to authenticated;

-- claim_order does its own rider lookup rather than calling current_rider_id(),
-- because it also needs the name for the orders.rider display mirror. It has to
-- repeat the archived check, or an archived rider with an offer made moments
-- before they were archived could still claim it.
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
    from riders r
   where r.user_id = auth.uid()
     and r.archived_at is null;

  if v_rider_id is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
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

-- The count in the admin list has to describe what dispatch will actually do,
-- or the button says "offer to 3" and offers to 1. Same predicate as
-- admin_dispatch_order below, deliberately.
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
      where d.city = r.city
        and d.status = 'online'
        and d.archived_at is null)
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

-- The dispatch roster: only riders who can actually be offered something. This
-- is not the rider directory -- /dashboard/riders still shows archived riders,
-- which is where an admin goes to un-archive one. Returning archived riders
-- here would invite offers that admin_dispatch_order then refuses.
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
  where d.archived_at is null
  order by (d.status = 'online') desc, d.name;
end;
$$;

comment on function public.dispatch_riders() is
  'Riders that can be offered a delivery: live, online-first. Archived riders are excluded; the rider directory is where they are managed.';

revoke all on function public.dispatch_riders() from public;
revoke all on function public.dispatch_riders() from anon;
grant execute on function public.dispatch_riders() to authenticated;

-- The actual gate. An archived rider is not offered work regardless of what
-- the admin picked.
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
     and d.archived_at is null
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
  'Offers an unassigned order to live online riders in the restaurant city, or to explicit rider ids. Archived riders are never offered. Admins only. Offers live for 5 minutes.';

revoke all on function public.admin_dispatch_order(text, text[]) from public;
revoke all on function public.admin_dispatch_order(text, text[]) from anon;
grant execute on function public.admin_dispatch_order(text, text[]) to authenticated;