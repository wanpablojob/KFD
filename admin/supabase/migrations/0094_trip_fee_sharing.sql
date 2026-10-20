-- --------------------------------------------------------------------------
-- 0094: every peso of a trip is attributed exactly once
-- --------------------------------------------------------------------------
--
-- 0092 put the trip's fees on the trip and left each shop's order at the
-- price of its own food. That is honest about the trip, but it quietly broke
-- the books: the platform's revenue, the restaurant aggregate and the orders
-- CSV all read order.total, and for a multi-shop order that total no longer
-- held the delivery fee or the service fee. The money was not lost -- it was
-- on the trip -- but nothing that counts an order could see it, so the
-- revenue understated every multi-shop order.
--
-- Each shop's order now carries its SHARE of the trip's fees, in proportion
-- to what that shop is cooking, and the shares add up to the trip's fees
-- exactly (the last shop carries the rounding remainder). So:
--
--   * the shops' order totals still add up to the trip's total,
--   * every peso is counted once, by the book that counted orders before,
--   * a shop that drops out re-cuts the shares, because the extra-shop
--     surcharge went with it.
--
-- The customer is not shown a per-shop fee: the checkout and the tracking
-- screen show the trip's one total (0092), which is what they pay.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- The trip's fees, shared between its shops
-- --------------------------------------------------------------------------

create or replace function public.split_trip_fees(
  p_delivery_id text,
  p_delivery_fee numeric,
  p_service_fee numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subtotal numeric;
  v_part record;
  v_index int := 0;
  v_parts int;
  v_running_delivery numeric := 0;
  v_running_service numeric := 0;
  v_delivery_share numeric;
  v_service_share numeric;
begin
  select count(*), coalesce(sum(o.subtotal), 0)
    into v_parts, v_subtotal
    from public.orders o
   where o.delivery_id = p_delivery_id
     and o.status <> 'cancelled';

  -- A shop that dropped out is not part of the trip any more: its share of
  -- the fees goes with it, so the money left with the food.
  update public.orders o
     set delivery_fee = 0,
         service_fee = 0,
         total = o.subtotal
   where o.delivery_id = p_delivery_id
     and o.status = 'cancelled';

  if v_parts = 0 then
    return;
  end if;

  for v_part in
    select o.id, o.subtotal
      from public.orders o
     where o.delivery_id = p_delivery_id
       and o.status <> 'cancelled'
     order by o.placed_at, o.reference
  loop
    v_index := v_index + 1;

    if v_subtotal > 0 then
      v_delivery_share := round(p_delivery_fee * v_part.subtotal / v_subtotal, 2);
      v_service_share := round(p_service_fee * v_part.subtotal / v_subtotal, 2);
    else
      v_delivery_share := 0;
      v_service_share := 0;
    end if;

    v_running_delivery := v_running_delivery + v_delivery_share;
    v_running_service := v_running_service + v_service_share;

    -- The last shop carries the rounding remainder, so the shares add up to
    -- the trip's fees to the cent.
    if v_index = v_parts then
      v_delivery_share := p_delivery_fee - (v_running_delivery - v_delivery_share);
      v_service_share := p_service_fee - (v_running_service - v_service_share);
    end if;

    -- Only the money columns move: the status is untouched, so the trigger
    -- that keeps a trip in step with its shops does not run again here.
    update public.orders o
       set delivery_fee = v_delivery_share,
           service_fee = v_service_share,
           total = o.subtotal + v_delivery_share + v_service_share
     where o.id = v_part.id;
  end loop;
end;
$$;

comment on function public.split_trip_fees(text, numeric, numeric) is
  'Share a trip''s delivery and service fees between its shops in proportion to what each is cooking, so every peso is counted once (0094). The last shop carries the rounding remainder.';

revoke all on function public.split_trip_fees(text, numeric, numeric) from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- Rebuilt from their live definitions, with the sharing added
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

  -- Every peso is attributed once (0094): the trip's fees are shared between
  -- the shops in proportion to what each one is cooking, and the shares add
  -- up to the trip's fees exactly. Without this the shops' orders would be
  -- food only, and every book that reads order.total -- the platform's
  -- revenue, the restaurant aggregate, the CSV -- would quietly lose the
  -- delivery and service fees of a multi-shop order.
  perform public.split_trip_fees(v_delivery_id, v_delivery_fee, v_service_fee);

  return query
    select v_delivery_id, v_reference, v_order_ids, v_total, 'pending'::public.delivery_status;
end;
$$;

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
begin
  if v_delivery_id is null then
    return null;
  end if;

  if new.status is not distinct from old.status then
    return null;
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

  select d.base_delivery_fee, d.service_fee
    into v_base, v_service
    from public.deliveries d
   where d.id = v_delivery_id;

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
  if not v_any_pending and old.status = 'pending' then
    perform public.offer_delivery_to_riders(v_delivery_id);
  end if;

  return null;
end;
$$;
