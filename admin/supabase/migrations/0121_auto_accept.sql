-- --------------------------------------------------------------------------
-- 0121: an order is accepted by placing it
-- --------------------------------------------------------------------------
--
-- THE PROBLEM. Until now the shop had to accept an order before anything
-- happened to it. The customer places it, it sits in "Needs your decision",
-- and no rider is offered it until the shop taps Accept. A busy shop -- one
-- person on the till, a screen full of orders, a customer on the phone --
-- can leave an order there indefinitely. It never moves, the customer waits
-- for a decision that is not really a decision (the food was ordered either
-- way; the only question is when the rider leaves), and on a basket from
-- several shops ONE busy shop holds the whole basket.
--
-- WHAT FOODPANDA DOES, AND WHY IT IS RIGHT HERE. The order prints, the
-- kitchen makes it, and the shop can still refuse. The acceptance tap is
-- ceremony: the shop was always going to make the food. So that is the
-- default now: an order is accepted the moment it is placed, the rider is
-- offered it at once, and the shop's "cancel" is how it says it cannot make
-- it (the customer is told, and nothing has been charged -- the money is
-- collected on delivery).
--
-- THE SHOPS THAT WANT THE GATE. A kitchen that has to schedule, or one that
-- genuinely checks each order, can turn it back on. Even then an order cannot
-- strand a customer: after five minutes it is accepted anyway, by the same
-- scheduler that already re-offers lapsed deliveries (0100). Five minutes is
-- the merchant app's own "overdue" mark, so the shop sees the order about to
-- be accepted out from under it.
--
-- THE CUSTOMER KEEPS A WAY OUT. With the order accepted at once, "the
-- restaurant has already accepted it" would be true from the first second and
-- the customer could never cancel. So cancel_order now also accepts an order
-- that is confirmed and has not started cooking -- which is exactly the
-- window Foodpanda leaves open.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- The setting
-- --------------------------------------------------------------------------

alter table public.restaurants
  add column if not exists auto_accept boolean not null default true;

comment on column public.restaurants.auto_accept is
  'True when an order is accepted the moment it is placed, the way a busy kitchen wants it: the order prints, the rider is offered it, and the shop can still cancel. False puts the order in front of the shop to accept; it is accepted anyway after five minutes, so it can never strand the customer (0121).';

-- --------------------------------------------------------------------------
-- An order placed at an auto-accepting shop is confirmed as it is written
-- --------------------------------------------------------------------------

create or replace function public.orders_auto_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only an order the shop has not looked at yet: a shop that keeps the gate
  -- still gets its "Needs your decision" queue.
  if new.status = 'pending'
     and new.restaurant_id is not null
     and exists (
       select 1 from public.restaurants r
        where r.id = new.restaurant_id
          and r.auto_accept
     ) then
    new.status := 'confirmed';
  end if;
  return new;
end;
$$;

comment on function public.orders_auto_accept() is
  'Accepts an order as it is written when the shop takes orders automatically, so a busy kitchen never has to tap anything (0121).';

revoke all on function public.orders_auto_accept() from public, anon, authenticated;

drop trigger if exists orders_auto_accept on public.orders;
create trigger orders_auto_accept
  before insert on public.orders
  for each row execute function public.orders_auto_accept();

-- --------------------------------------------------------------------------
-- The dispatch triggers have to see the insert
-- --------------------------------------------------------------------------
--
-- Both triggers below used to fire on an UPDATE, because the order was
-- accepted by an UPDATE. An order accepted as it is written never gets that
-- UPDATE, so the rider would never be offered it. OLD is not assigned in an
-- INSERT trigger, so every reference to it is guarded by tg_op.

create or replace function public.orders_auto_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed'
     and (case when tg_op = 'INSERT' then true else old.status is distinct from 'confirmed' end)
     and new.rider_id is null
     -- A part of a trip is offered with the trip (0090), not on its own.
     and new.delivery_id is null then
    -- A rider reporting a failed delivery puts the order back to 'confirmed',
    -- and the same trigger re-offers it. Nobody pushes that re-offer today
    -- (0100): the rider only finds out by opening the app.
    -- The push is queued for an order nobody has heard of: one that was
    -- accepted as it was placed, or one a rider gave up on. Without this the
    -- riders would only find a new order by opening the app, because the
    -- shop's "Accept" tap -- which used to be what alerted them -- no longer
    -- happens.
    perform public.offer_order_to_riders(
      new.id,
      tg_op = 'INSERT' or new.delivery_failed_by is not null
    );
  end if;
  return null;
end;
$$;

drop trigger if exists orders_auto_dispatch on public.orders;
create trigger orders_auto_dispatch
  after insert or update of status on public.orders
  for each row execute function public.orders_auto_dispatch();

create or replace function public.deliveries_sync_from_parts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery_id text := new.delivery_id;
  v_shops int;
  v_subtotal numeric;
  v_base numeric;
  v_service numeric;
  v_status public.delivery_status;
  v_any_collected boolean;
  v_all_delivered boolean;
  v_any_pending boolean;
  v_any_preparing boolean;
  v_expected int;
begin
  if v_delivery_id is null then
    return null;
  end if;

  -- Only a change of status is worth syncing. OLD is not assigned in an
  -- INSERT trigger, so it is not even looked at there.
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then
      return null;
    end if;
  end if;

  select
    count(*),
    coalesce(sum(o.subtotal), 0),
    coalesce(bool_or(o.status = 'out_for_delivery'), false),
    coalesce(bool_and(o.status = 'delivered'), false),
    coalesce(bool_or(o.status = 'pending'), false),
    coalesce(bool_or(o.status = 'preparing'), false)
    into v_shops, v_subtotal, v_any_collected, v_all_delivered, v_any_pending, v_any_preparing
    from public.orders o
   where o.delivery_id = v_delivery_id
     and o.status <> 'cancelled';

  select d.base_delivery_fee, d.service_fee, d.shops
    into v_base, v_service, v_expected
    from public.deliveries d
   where d.id = v_delivery_id;

  -- A trip is assembled one shop at a time, so a part that arrives as
  -- accepted is not the whole trip yet. The trip's own shop count says how
  -- many parts it is waiting for.
  if tg_op = 'INSERT' and v_shops < v_expected then
    return null;
  end if;

  -- Every shop dropped it: the trip is over.
  if v_shops = 0 then
    update public.deliveries d
       set status = 'cancelled',
           shops = 0,
           subtotal = 0,
           delivery_fee = 0,
           service_fee = 0,
           total = 0,
           updated_at = now()
     where d.id = v_delivery_id;
    return null;
  end if;

  -- A shop still deciding keeps the trip pending; a kitchen cooking makes it
  -- preparing; food with the rider makes it out for delivery.
  v_status := case
    when v_all_delivered then 'delivered'::public.delivery_status
    when v_any_collected then 'out_for_delivery'::public.delivery_status
    when v_any_pending then 'pending'::public.delivery_status
    when v_any_preparing then 'preparing'::public.delivery_status
    else 'confirmed'::public.delivery_status
  end;

  -- Re-priced: the extra-shop surcharge goes away with a shop that rejected;
  -- the base rate and the service fee stay.
  update public.deliveries d
     set shops = v_shops,
         subtotal = v_subtotal,
         delivery_fee = v_base + public.extra_shop_fee() * (v_shops - 1),
         service_fee = v_service,
         total = v_subtotal + v_base + public.extra_shop_fee() * (v_shops - 1) + v_service,
         status = v_status,
         updated_at = now()
   where d.id = v_delivery_id;

  -- The shops' shares are re-cut when a shop drops out: the extra-shop
  -- surcharge is gone, so the shops that are left carry the fees that are
  -- left (0094).
  perform public.split_trip_fees(
    v_delivery_id,
    v_base + public.extra_shop_fee() * (v_shops - 1),
    v_service
  );

  -- The last shop that was still deciding has now accepted: the trip goes to
  -- the riders. One set of offers for the whole trip, not one per shop.
  if not v_any_pending
     and (case when tg_op = 'INSERT' then true else old.status = 'pending' end) then
    -- The same for a trip: the riders have to hear about it, and there may be
    -- no merchant tap to alert them.
    perform public.offer_delivery_to_riders(v_delivery_id, tg_op = 'INSERT');
  end if;

  return null;
end;
$$;

drop trigger if exists deliveries_sync_from_parts on public.orders;
create trigger deliveries_sync_from_parts
  after insert or update of status on public.orders
  for each row execute function public.deliveries_sync_from_parts();

-- --------------------------------------------------------------------------
-- The gate cannot strand a customer
-- --------------------------------------------------------------------------

create or replace function public.auto_accept_pending_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  -- An order at a shop that keeps the gate, waiting longer than the shop's
  -- own overdue mark (the merchant app flags five minutes). It is accepted
  -- anyway: a shop that has not looked at an order in five minutes is a busy
  -- shop, not a refusing one.
  for v_row in
    select o.id
      from public.orders o
      join public.restaurants r on r.id = o.restaurant_id
     where o.status = 'pending'
       and not r.auto_accept
       and o.placed_at <= now() - interval '5 minutes'
  loop
    update public.orders o
       set status = 'confirmed'
     where o.id = v_row.id
       and o.status = 'pending';
    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

comment on function public.auto_accept_pending_orders() is
  'Accept the orders a gated shop has left waiting for more than five minutes, so a busy kitchen can never strand a customer (0121). Run by the scheduler (0100).';

revoke all on function public.auto_accept_pending_orders() from public, anon, authenticated;

-- The scheduler already runs every minute to re-offer lapsed deliveries. It
-- sweeps the gate in the same breath.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'reoffer-lapsed-offers') then
    perform cron.schedule(
      'reoffer-lapsed-offers',
      '* * * * *',
      $job$
        select public.reoffer_lapsed_offers();
        select public.push_queued_offers();
        select public.auto_accept_pending_orders();
      $job$
    );
  end if;
end $$;

-- --------------------------------------------------------------------------
-- The shop's switch
-- --------------------------------------------------------------------------

create or replace function public.merchant_set_auto_accept(p_auto_accept boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant text := public.current_merchant_restaurant();
begin
  if auth.uid() is null or v_restaurant is null then
    raise exception 'Only a restaurant''s merchant can change this.'
      using errcode = '42501';
  end if;
  if p_auto_accept is null then
    raise exception 'Choose whether orders are accepted automatically.' using errcode = '22023';
  end if;

  update public.restaurants r
     set auto_accept = p_auto_accept,
         updated_at = now()
   where r.id = v_restaurant;

  return p_auto_accept;
end;
$$;

comment on function public.merchant_set_auto_accept(boolean) is
  'A shop''s own switch: true accepts every order as it is placed (the default), false puts each order in front of the shop, to be accepted anyway after five minutes (0121).';

revoke all on function public.merchant_set_auto_accept(boolean) from public, anon, authenticated;
grant execute on function public.merchant_set_auto_accept(boolean) to authenticated;

-- --------------------------------------------------------------------------
-- The customer keeps a way out
-- --------------------------------------------------------------------------

create or replace function public.cancel_order(p_order_id text)
 RETURNS TABLE(order_id text, reference text, status order_status)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row orders;
  v_auto_accept boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Sign in to cancel an order.' using errcode = '42501';
  end if;

  select * into v_row
    from orders o
   where o.id = p_order_id
   for update;

  if not found then
    raise exception 'Order not found.' using errcode = 'P0001';
  end if;

  if v_row.customer_user_id is distinct from auth.uid() then
    raise exception 'This is not your order.' using errcode = '42501';
  end if;

  -- A shop that takes orders automatically has not looked at this one yet, so
  -- the customer may still call it off -- the same window Foodpanda leaves
  -- open. Once the kitchen has started, it is too late for either of them.
  select r.auto_accept into v_auto_accept
    from restaurants r
   where r.id = v_row.restaurant_id;

  if v_row.status = 'confirmed' and coalesce(v_auto_accept, false) then
    null;
  elsif v_row.status <> 'pending' then
    raise exception 'The restaurant has already accepted this order. Call them to cancel.'
      using errcode = 'P0001';
  end if;

  update orders
     set status = 'cancelled',
         rejection_reason = 'Cancelled by customer'
   where id = p_order_id;

  return query
    select v_row.id, v_row.reference, 'cancelled'::order_status;
end;
$function$;

comment on function public.cancel_order(text) is
  'The customer''s own cancellation. Allowed while the order is pending, and also while it is confirmed at a shop that takes orders automatically -- the kitchen has not started it yet (0121).';

revoke all on function public.cancel_order(text) from public, anon, authenticated;
grant execute on function public.cancel_order(text) to authenticated;
