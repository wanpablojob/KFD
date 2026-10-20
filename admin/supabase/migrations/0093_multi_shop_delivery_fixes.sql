-- --------------------------------------------------------------------------
-- 0093: multi-shop delivery, the holes the first pass left
-- --------------------------------------------------------------------------
--
-- 0092 built the trip: a basket from several shops, one delivery fee, one
-- rider, one drop-off. This file closes five holes in it, each found by
-- reading the live behaviour rather than the intent.
--
-- 1. A RIDER COULD CLAIM ONE SHOP OF A TRIP.
--    Dispatch offers live per order, and the admin's manual dispatch offered
--    any confirmed order -- including one shop of a trip. A rider who claimed
--    that would have been left holding a single kitchen's food with no trip
--    around it. claim_order and admin_dispatch_order now refuse a part of a
--    trip: the trip is dispatched and claimed as a whole, through
--    admin_dispatch_delivery and claim_delivery.
--
-- 2. THE SHOP COUNT COULD BE INFLATED.
--    quote_delivery and customer_place_delivery counted the entries the client
--    sent, so a basket that named the same restaurant twice was charged the
--    extra-shop surcharge for a shop the customer never added. The shops are
--    now normalised first: the same restaurant named twice is one shop, with
--    its lines merged.
--
-- 3. A SHOP WAS PRICED TWICE.
--    customer_place_delivery priced every shop once to check the basket and
--    again to write the orders. A menu price that moved in between left the
--    trip's subtotal disagreeing with the shops' subtotals, and the customer
--    was charged a total that was not the sum of what they bought. Every shop
--    is now priced once, and the orders are written from that same price.
--
-- 4. ANY SIGNED-IN USER COULD READ A TRIP'S SHOPS.
--    delivery_stops is now readable by the trip's own customer, the rider
--    carrying it, and an admin -- nobody else.
--
-- Every function here is rebuilt from its live definition (0092 for the
-- functions 0092 created, pg_get_functiondef against the live database for
-- the older ones), not from an older migration.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- 1. One shop per restaurant, whatever the client sends
-- --------------------------------------------------------------------------

create or replace function public.normalise_shops(p_shops jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_entry record;
  v_ids text[] := '{}';
  v_items jsonb[] := '{}';
  v_idx int;
  v_merged jsonb;
  v_out jsonb := '[]'::jsonb;
begin
  if p_shops is null or jsonb_typeof(p_shops) <> 'array' then
    return p_shops;
  end if;

  for v_entry in select * from jsonb_array_elements(p_shops) loop
    v_idx := array_position(v_ids, v_entry.value ->> 'restaurant_id');

    if v_idx is null then
      v_ids := array_append(v_ids, v_entry.value ->> 'restaurant_id');
      v_items := array_append(v_items, coalesce(v_entry.value -> 'items', '[]'::jsonb));
    else
      -- The same shop again: one shop, with its lines merged. The quantities
      -- of the same item add up, so a split line is not a second line.
      select jsonb_agg(
               jsonb_build_object('menu_item_id', i.menu_item_id, 'quantity', i.quantity)
               order by i.menu_item_id
             )
        into v_merged
        from (
          select e.value ->> 'menu_item_id' as menu_item_id,
                 sum((e.value ->> 'quantity')::int) as quantity
            from jsonb_array_elements(v_items[v_idx] || coalesce(v_entry.value -> 'items', '[]'::jsonb)) e
           group by 1
        ) i;

      v_items[v_idx] := v_merged;
    end if;
  end loop;

  if array_length(v_ids, 1) is not null then
    for v_idx in 1..array_length(v_ids, 1) loop
      v_out := v_out || jsonb_build_array(
        jsonb_build_object('restaurant_id', v_ids[v_idx], 'items', v_items[v_idx])
      );
    end loop;
  end if;

  return v_out;
end;
$$;

comment on function public.normalise_shops(jsonb) is
  'The basket with one entry per restaurant: a restaurant named twice is one shop, with its lines merged (0093).';

revoke all on function public.normalise_shops(jsonb) from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- 2. quote_delivery: priced from the normalised basket
-- --------------------------------------------------------------------------

create or replace function public.quote_delivery(
  p_shops jsonb,
  p_delivery_barangay text default null
)
returns table (
  shop_count int,
  subtotal numeric,
  base_delivery_fee numeric,
  delivery_fee numeric,
  service_fee numeric,
  total numeric,
  fee_agreed_in_person boolean,
  unknown_barangay boolean,
  shops jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_max_shops constant int := 10;
  v_entry record;
  v_priced record;
  v_shop_count int := 0;
  v_subtotal numeric := 0;
  v_base numeric;
  v_delivery_fee numeric;
  v_service_fee numeric;
  v_agreed boolean;
  v_unknown boolean := false;
  v_shops jsonb := '[]'::jsonb;
  v_basket jsonb;
  v_barangay text := nullif(btrim(coalesce(p_delivery_barangay, '')), '');
begin
  if p_shops is null or jsonb_typeof(p_shops) <> 'array'
     or jsonb_array_length(p_shops) = 0 then
    raise exception 'Your cart is empty.';
  end if;

  if jsonb_array_length(p_shops) > c_max_shops then
    raise exception 'You can order from at most % restaurants in one delivery.', c_max_shops
      using errcode = '22023';
  end if;

  -- One entry per restaurant, so a shop named twice is not charged as two.
  v_basket := public.normalise_shops(p_shops);

  for v_entry in select * from jsonb_array_elements(v_basket) loop
    v_shop_count := v_shop_count + 1;

    select s.* into v_priced
      from public.price_shop(
        v_entry.value ->> 'restaurant_id',
        v_entry.value -> 'items'
      ) s;

    v_subtotal := v_subtotal + v_priced.subtotal;

    v_shops := v_shops || jsonb_build_object(
      'restaurant_id', v_priced.restaurant_id,
      'restaurant', v_priced.restaurant_name,
      'is_open', v_priced.is_open,
      'prep_minutes', v_priced.prep_minutes,
      'subtotal', v_priced.subtotal,
      'items', v_priced.items
    );
  end loop;

  select f.base_rate, f.delivery_fee, f.service_fee, f.fee_agreed_in_person
    into v_base, v_delivery_fee, v_service_fee, v_agreed
    from public.delivery_fees(v_barangay, v_shop_count) f;

  -- Reported, not raised: the customer has to see the basket priced to finish
  -- choosing. The refusal lives in customer_place_delivery.
  if v_base is null and not v_agreed and exists (select 1 from service_areas) then
    v_unknown := true;
  end if;

  return query
    select v_shop_count,
           v_subtotal,
           coalesce(v_base, 0),
           v_delivery_fee,
           v_service_fee,
           v_subtotal + v_delivery_fee + v_service_fee,
           v_agreed,
           v_unknown,
           v_shops;
end;
$$;

comment on function public.quote_delivery(jsonb, text) is
  'Server-authoritative price preview for a basket that may hold food from several shops, priced for the destination barangay. The delivery fee is the barangay''s rate plus 10.00 per extra shop; the service fee is charged once (0092). A restaurant named twice is one shop (0093).';

revoke all on function public.quote_delivery(jsonb, text) from public;
grant execute on function public.quote_delivery(jsonb, text) to anon, authenticated;

-- --------------------------------------------------------------------------
-- 3. customer_place_delivery: one price, written once
-- --------------------------------------------------------------------------

create or replace function public.customer_place_delivery(
  p_shops jsonb,
  p_delivery_address text,
  p_payment payment_method,
  p_client_request_id text default null,
  p_delivery_barangay text default null
)
returns table (
  delivery_id text,
  reference text,
  order_ids text[],
  total numeric,
  status public.delivery_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_shops constant int := 10;
  c_max_open_orders constant int := 3;

  v_customer_name text;
  v_customer_phone text;
  v_entry record;
  v_priced record;
  v_priced_shops jsonb := '[]'::jsonb;
  v_shop_count int := 0;
  v_subtotal numeric := 0;
  v_base numeric;
  v_delivery_fee numeric;
  v_service_fee numeric;
  v_agreed boolean;
  v_total numeric;
  v_reference text;
  v_delivery_id text;
  v_order_id text;
  v_order_ids text[] := '{}';
  v_address text := nullif(btrim(coalesce(p_delivery_address, '')), '');
  v_request_id text := nullif(btrim(coalesce(p_client_request_id, '')), '');
  v_barangay text := nullif(btrim(coalesce(p_delivery_barangay, '')), '');
  v_basket jsonb;
  v_existing public.deliveries;
begin
  if auth.uid() is null then
    raise exception 'Sign in to place an order.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from app_users where user_id = auth.uid() and role = 'customer'
  ) then
    raise exception 'This action is for customers only.' using errcode = '42501';
  end if;

  if exists (
    select 1 from customers
     where user_id = auth.uid()
       and (blocked_at is not null or archived_at is not null)
  ) then
    raise exception 'Your account cannot place orders right now. Please contact support.'
      using errcode = '42501';
  end if;

  -- A retry returns the trip that already went through, before any check the
  -- first attempt itself might now fail.
  if v_request_id is not null then
    select * into v_existing
      from public.deliveries d
     where d.customer_user_id = auth.uid()
       and d.client_request_id = v_request_id;

    if found then
      return query
        select v_existing.id,
               v_existing.reference,
               (select coalesce(array_agg(o.id order by o.placed_at), '{}')
                  from orders o where o.delivery_id = v_existing.id),
               v_existing.total,
               v_existing.status;
      return;
    end if;
  end if;

  if p_shops is null or jsonb_typeof(p_shops) <> 'array'
     or jsonb_array_length(p_shops) = 0 then
    raise exception 'Your cart is empty.';
  end if;

  if jsonb_array_length(p_shops) > c_max_shops then
    raise exception 'You can order from at most % restaurants in one delivery.', c_max_shops
      using errcode = '22023';
  end if;

  if p_payment is null or p_payment not in ('cash', 'e_wallet') then
    raise exception 'Choose cash on delivery or GCash.' using errcode = '22023';
  end if;

  if v_address is null or length(v_address) < 8 then
    raise exception 'Enter your full delivery address.' using errcode = '22023';
  end if;

  select
    coalesce(
      nullif(btrim(raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(email, '@', 1), ''),
      'Customer'
    ),
    nullif(btrim(raw_user_meta_data ->> 'phone'), '')
    into v_customer_name, v_customer_phone
  from auth.users
  where id = auth.uid();

  if v_customer_phone is null then
    raise exception 'Add a contact number so your rider can reach you.' using errcode = '22023';
  end if;

  -- The same cap as 0081: three trips on the way at once, counting the
  -- orders placed before multi-shop checkouts.
  if (
    select count(*) from (
      select d.id from public.deliveries d
       where d.customer_user_id = auth.uid()
         and d.status in ('pending', 'confirmed', 'preparing', 'out_for_delivery')
      union all
      select o.id from public.orders o
       where o.customer_user_id = auth.uid()
         and o.delivery_id is null
         and o.status in ('pending', 'confirmed', 'preparing', 'out_for_delivery')
    ) open_trips
  ) >= c_max_open_orders then
    raise exception 'You already have % orders on the way. Wait for one to arrive first.', c_max_open_orders
      using errcode = '22023';
  end if;

  -- One entry per restaurant, so a shop named twice is one shop (0093).
  v_basket := public.normalise_shops(p_shops);

  -- Price every shop ONCE, and keep the price. Nothing is written until the
  -- whole basket prices cleanly, so a bad line cannot leave half a trip
  -- behind; and the orders are written from these same prices, so the trip's
  -- subtotal is always the sum of the shops' subtotals.
  for v_entry in select * from jsonb_array_elements(v_basket) loop
    v_shop_count := v_shop_count + 1;

    select s.* into v_priced
      from public.price_shop(
        v_entry.value ->> 'restaurant_id',
        v_entry.value -> 'items'
      ) s;

    if v_priced.is_open is false then
      raise exception '% is closed right now.', v_priced.restaurant_name using errcode = '22023';
    end if;

    v_subtotal := v_subtotal + v_priced.subtotal;

    v_priced_shops := v_priced_shops || jsonb_build_object(
      'restaurant_id', v_priced.restaurant_id,
      'restaurant', v_priced.restaurant_name,
      'prep_minutes', v_priced.prep_minutes,
      'subtotal', v_priced.subtotal,
      'items', v_priced.items
    );
  end loop;

  -- Service area AND pricing, enforced together, exactly as 0081 does for one
  -- shop. A published list with no band for this barangay cannot be charged.
  select f.base_rate, f.delivery_fee, f.service_fee, f.fee_agreed_in_person
    into v_base, v_delivery_fee, v_service_fee, v_agreed
    from public.delivery_fees(v_barangay, v_shop_count) f;

  if exists (select 1 from service_areas) then
    if v_barangay is null then
      raise exception 'Choose your barangay.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from service_areas sa where lower(sa.barangay) = lower(v_barangay)
    ) then
      raise exception 'We do not deliver to % yet.', v_barangay using errcode = '22023';
    end if;
    if v_base is null and not v_agreed then
      raise exception 'We cannot deliver to % yet.', v_barangay using errcode = '22023';
    end if;
  end if;

  v_total := v_subtotal + v_delivery_fee + v_service_fee;
  v_reference := public.mint_order_reference();

  insert into public.deliveries (
    reference, customer_user_id, customer, customer_phone,
    delivery_address, delivery_barangay, city, payment,
    status, shops, subtotal, base_delivery_fee, delivery_fee, service_fee, total,
    fee_agreed_in_person, client_request_id, prep_minutes
  )
  select
    v_reference,
    auth.uid(),
    v_customer_name,
    v_customer_phone,
    v_address,
    v_barangay,
    (select min(r.city) from public.restaurants r
      where r.id in (select (e.value ->> 'restaurant_id') from jsonb_array_elements(v_basket) e)),
    p_payment,
    'pending'::public.delivery_status,
    v_shop_count,
    v_subtotal,
    coalesce(v_base, 0),
    v_delivery_fee,
    v_service_fee,
    v_total,
    v_agreed,
    v_request_id,
    (select max(r.prep_minutes) from public.restaurants r
      where r.id in (select (e.value ->> 'restaurant_id') from jsonb_array_elements(v_basket) e))
  returning id into v_delivery_id;

  -- One order per shop, from the prices above. The shop's row carries its own
  -- food subtotal and nothing else: the fees live on the trip, so a merchant's
  -- sales never include the delivery fee or another shop's food.
  for v_entry in select * from jsonb_array_elements(v_priced_shops) loop
    insert into public.orders (
      reference, customer, restaurant, restaurant_id,
      items, subtotal, delivery_fee, service_fee, total,
      status, payment, placed_at, rider, customer_user_id,
      delivery_address, delivery_barangay, customer_phone,
      client_request_id, prep_minutes, fee_agreed_in_person, delivery_id
    )
    select
      public.mint_order_reference(),
      v_customer_name,
      v_entry.value ->> 'restaurant',
      v_entry.value ->> 'restaurant_id',
      v_entry.value -> 'items',
      (v_entry.value ->> 'subtotal')::numeric,
      -- The fees belong to the trip. A shop's order total is its own food.
      0,
      0,
      (v_entry.value ->> 'subtotal')::numeric,
      'pending'::public.order_status,
      p_payment,
      now(),
      null,
      auth.uid(),
      v_address,
      v_barangay,
      v_customer_phone,
      null,
      (v_entry.value ->> 'prep_minutes')::int,
      v_agreed,
      v_delivery_id
    returning id into v_order_id;

    v_order_ids := array_append(v_order_ids, v_order_id);
  end loop;

  return query
    select v_delivery_id, v_reference, v_order_ids, v_total, 'pending'::public.delivery_status;
end;
$$;

comment on function public.customer_place_delivery(jsonb, text, payment_method, text, text) is
  'Price a basket that may hold food from up to ten shops and create one trip with one order per shop (0092). Customers only, not blocked or archived. Cash or e_wallet only, address and profile phone required. The delivery fee is the barangay''s rate plus 10.00 per extra shop and the service fee is charged once. p_client_request_id makes retries idempotent. Totals are never accepted from the client. Every shop is priced once, and a restaurant named twice is one shop (0093).';

revoke all on function public.customer_place_delivery(jsonb, text, payment_method, text, text) from public;
revoke all on function public.customer_place_delivery(jsonb, text, payment_method, text, text) from anon;
grant execute on function public.customer_place_delivery(jsonb, text, payment_method, text, text) to authenticated;

-- --------------------------------------------------------------------------
-- 4. A trip's shops: the customer, the rider and an admin only
-- --------------------------------------------------------------------------

create or replace function public.delivery_stops(p_delivery_id text)
returns table (
  order_id text,
  reference text,
  restaurant text,
  restaurant_id text,
  items jsonb,
  subtotal numeric,
  status public.order_status
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    exists (
      select 1 from public.deliveries d
       where d.id = p_delivery_id
         and d.customer_user_id = auth.uid()
    )
    or exists (
      select 1 from public.deliveries d
       where d.id = p_delivery_id
         and d.rider_id = public.current_rider_id()
    )
    or public.is_platform_admin()
  ) then
    return;
  end if;

  return query
    select o.id, o.reference, o.restaurant, o.restaurant_id, o.items, o.subtotal, o.status
      from public.orders o
     where o.delivery_id = p_delivery_id
     order by o.placed_at, o.reference;
end;
$$;

comment on function public.delivery_stops(text) is
  'The shops of a trip, for the rider''s trip screen and the customer''s tracking (0090). A shop that rejected is still listed, with its own status. Only the trip''s customer, its rider and an admin can read it (0093).';

revoke all on function public.delivery_stops(text) from public, anon;
grant execute on function public.delivery_stops(text) to authenticated;

-- --------------------------------------------------------------------------
-- 5. The rider's trips carry their payment method
-- --------------------------------------------------------------------------
--
-- The rider has to know, at the door, whether to collect cash or to expect a
-- GCash scan. The trip's payment was on the trip all along; the list just
-- did not say so.
--
-- The return type changed, so the old one is dropped first: CREATE OR REPLACE
-- cannot change what a function returns.
drop function if exists public.rider_my_deliveries(timestamp with time zone, integer);

create or replace function public.rider_my_deliveries(
  p_cursor timestamp with time zone default null,
  p_limit integer default 20
)
returns table (
  delivery_id text,
  reference text,
  customer text,
  delivery_address text,
  customer_phone text,
  shops int,
  subtotal numeric,
  delivery_fee numeric,
  service_fee numeric,
  total numeric,
  status public.delivery_status,
  payment payment_method,
  placed_at timestamp with time zone
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.reference, d.customer, d.delivery_address, d.customer_phone,
         d.shops, d.subtotal, d.delivery_fee, d.service_fee, d.total,
         d.status, d.payment, d.placed_at
    from public.deliveries d
   where d.rider_id = public.current_rider_id()
     and (p_cursor is null or d.placed_at < p_cursor)
   order by d.placed_at desc
   limit greatest(coalesce(p_limit, 20), 1);
$$;

comment on function public.rider_my_deliveries(timestamp with time zone, integer) is
  'The trips assigned to the signed-in rider, newest first, with the payment method so the rider knows what to collect (0092, 0093).';

revoke all on function public.rider_my_deliveries(timestamp with time zone, integer) from public, anon, authenticated;
grant execute on function public.rider_my_deliveries(timestamp with time zone, integer) to authenticated;

-- --------------------------------------------------------------------------
-- 6. A part of a trip is never dispatched or claimed on its own
-- --------------------------------------------------------------------------

-- Live body, plus one guard. A part of a trip is dispatched and claimed with
-- the trip (admin_dispatch_delivery, claim_delivery): a rider who claimed
-- one shop of a basket would be left holding one kitchen's food with no trip
-- around it.
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

  -- A part of a trip is claimed with the trip (0093).
  if exists (
    select 1 from orders o
     where o.id = p_order_id
       and o.delivery_id is not null
  ) then
    raise exception 'That order is part of a delivery. Claim the delivery instead.' using errcode = 'P0001';
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
     and o.delivery_id is null
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

-- Live body, plus one guard, for the same reason.
CREATE OR REPLACE FUNCTION public.admin_dispatch_order(p_order_id text, p_rider_ids text[] DEFAULT NULL::text[])
 RETURNS TABLE(order_id text, offered_to integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_city text;
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  perform public.expire_stale_offers();

  -- A part of a trip is dispatched with the trip (0093).
  if exists (
    select 1 from orders o
     where o.id = p_order_id
       and o.delivery_id is not null
  ) then
    raise exception 'That order is part of a delivery. Dispatch the delivery instead.'
      using errcode = '22023';
  end if;

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

-- --------------------------------------------------------------------------
-- 7. The trips waiting for a rider
-- --------------------------------------------------------------------------
--
-- The admin's safety net under auto-dispatch: a trip whose offers lapsed, or
-- one a rider gave up on. Without this the dispatcher would see the trip's
-- SHOPS on the waiting list and have nothing to dispatch, because a part is
-- never dispatched on its own.
create or replace function public.admin_pending_deliveries()
returns table (
  delivery_id text,
  reference text,
  customer text,
  shops int,
  subtotal numeric,
  total numeric,
  status public.delivery_status,
  city text,
  placed_at timestamp with time zone
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.reference, d.customer, d.shops, d.subtotal, d.total,
         d.status, d.city, d.placed_at
    from public.deliveries d
   where d.rider_id is null
     and d.status in ('confirmed', 'preparing')
   order by d.placed_at;
$$;

comment on function public.admin_pending_deliveries() is
  'The trips waiting for a rider (0093). The admin dispatches a trip as a whole; a shop''s part is never dispatched on its own.';

revoke all on function public.admin_pending_deliveries() from public, anon, authenticated;
grant execute on function public.admin_pending_deliveries() to authenticated;
