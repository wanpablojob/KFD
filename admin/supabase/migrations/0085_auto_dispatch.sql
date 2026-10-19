-- --------------------------------------------------------------------------
-- Auto-dispatch: offer an order to riders the moment the restaurant accepts
--
-- Until now an order reached riders only when an admin pressed Dispatch:
-- nothing scheduled or triggered admin_dispatch_order, so every accepted order
-- waited on a person. This makes acceptance itself the dispatch. When an order
-- moves to 'confirmed' with no rider, it is offered to every eligible rider in
-- the restaurant's city: online, not archived or suspended, not already
-- carrying an order, and not one who declined it. The offer lasts 5 minutes,
-- like a manual dispatch. Rider phones are alerted by the merchant portal
-- calling /api/dispatch/notify right after the status change, since a Postgres
-- trigger cannot send a push.
--
-- A rider reporting a failed delivery puts the order back to 'confirmed' with
-- no rider (0044), so the same trigger re-offers it, skipping that rider.
--
-- There is still no scheduler, so offers that expire unclaimed are not
-- re-sent by themselves. The admin overview lists such orders under "Needs
-- attention" with a Re-offer button, which calls admin_dispatch_order.
--
-- Also fixes a stall this would have made common: claim_order and
-- admin_dispatch_order accepted only 'confirmed', so once the kitchen pressed
-- "start preparing" no rider could claim the order and no admin could dispatch
-- it. Both now accept 'confirmed' or 'preparing'. Rebuilt from the live
-- definitions (pg_get_functiondef), not from an older migration.
-- --------------------------------------------------------------------------

create or replace function public.offer_order_to_riders(p_order_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city text;
  v_failed_by text;
  v_count integer;
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
  return v_count;
end;
$$;

comment on function public.offer_order_to_riders(text)
  is 'Offer an accepted order to every eligible rider in its city for 5 minutes. Internal: called by the acceptance trigger; admins use admin_dispatch_order (0085).';

revoke all on function public.offer_order_to_riders(text) from public, anon, authenticated;

create or replace function public.orders_auto_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed'
     and old.status is distinct from 'confirmed'
     and new.rider_id is null then
    perform public.offer_order_to_riders(new.id);
  end if;
  return null;
end;
$$;

revoke all on function public.orders_auto_dispatch() from public, anon, authenticated;

drop trigger if exists orders_auto_dispatch on public.orders;
create trigger orders_auto_dispatch
  after update of status on public.orders
  for each row execute function public.orders_auto_dispatch();

-- claim_order: live body, status condition widened.
CREATE OR REPLACE FUNCTION public.claim_order(p_order_id text)
 RETURNS TABLE(order_id text, reference text, restaurant text, delivery_address text, items jsonb, total numeric, rider_payout numeric, payment payment_method, placed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_rider_id text;
  v_rider_name text;
begin
  perform public.expire_stale_offers();

  select r.id, r.name into v_rider_id, v_rider_name
    from riders r
   where r.user_id = auth.uid()
     and r.archived_at is null
     and r.suspended_at is null;

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
    raise exception 'That delivery is no longer available.' using errcode = 'P0001';
  end if;

  update orders o
     set rider_id = v_rider_id,
         -- Display mirror for admin (queries.ts still selects orders.rider).
         -- Written here and nowhere else; rider_id remains the source of truth.
         rider = v_rider_name,
         -- Frozen now, not read at payout time. RESTORED: 0050 dropped this
         -- line while rebuilding the body, and rider_mark_delivered has been
         -- writing coalesce(rider_payout, 0) ever since.
         rider_payout = public.rider_payout_per_delivery()
   where o.id = p_order_id
     and o.rider_id is null
     -- Accepted orders only, matching admin_dispatch_order: never one the
     -- restaurant has not accepted. 'preparing' too (0085): the kitchen starting
     -- to cook must not void the offers auto-dispatch sent on acceptance, and
     -- rider_mark_delivered completes from either state.
     and o.status in ('confirmed', 'preparing')
  returning o.id, o.reference, o.restaurant, o.delivery_address,
            o.items, o.total, o.rider_payout, o.payment, o.placed_at
    into order_id, reference, restaurant, delivery_address,
         items, total, rider_payout, payment, placed_at;

  if order_id is null then
    raise exception 'Someone else already took this delivery.' using errcode = 'P0001';
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
$function$;

-- admin_dispatch_order: live body, status condition widened.
CREATE OR REPLACE FUNCTION public.admin_dispatch_order(p_order_id text, p_rider_ids text[] DEFAULT NULL::text[])
 RETURNS TABLE(order_id text, offered_to integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- Required, and required as the first line inside the block (0041).
-- Returns TABLE(order_id text, ...), so `order_id` in the body is a PL/pgSQL
-- variable while order_offers also has an order_id column, and the ON CONFLICT
-- inference clause cannot tell them apart: ERROR 42702, column reference
-- "order_id" is ambiguous. Qualifying does not help -- Postgres rejects
-- `on conflict (o.order_id, ...)` with a syntax error.
--
-- This directive was lost when the body was rebuilt from an older copy. It is
-- not cosmetic: admin_dispatch_order is the only writer of order_offers, and
-- claim_order refuses any order the rider was never offered, so with dispatch
-- raising 42702 no rider can ever claim anything.
#variable_conflict use_column
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
     -- 'confirmed' only: the restaurant has accepted.
     and o.status in ('confirmed', 'preparing');

  if v_city is null then
    raise exception 'That order is not available for dispatch. It may already have a rider, or the restaurant has not accepted it yet.' using errcode = '22023';
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
     and d.suspended_at is null
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
$function$;
