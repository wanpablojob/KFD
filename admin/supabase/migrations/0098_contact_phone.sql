-- --------------------------------------------------------------------------
-- 0098: the number the rider calls belongs to the delivery, not the account
-- --------------------------------------------------------------------------
--
-- customer_place_order and customer_place_delivery read the contact number
-- from the customer's auth account, so the number that reaches the rider is
-- whatever the account says. The app had to work around that by writing the
-- chosen address's number into the account before every checkout, which meant
-- one address's number quietly replaced the customer's own number -- and the
-- account's number was gone the moment they picked an address with a
-- different one.
--
-- Both functions now take the number for this delivery. It is validated the
-- way the app validates it, and the account's number is only the fallback, so
-- an order placed by an app that does not send one still goes through. The
-- account is never written to.
--
-- Rebuilt from their live definitions (0081 and 0094), with this one change.
-- --------------------------------------------------------------------------

drop function if exists public.customer_place_order(text, jsonb, text, payment_method, text, text);

create function public.customer_place_order(
  p_restaurant_id text,
  p_items jsonb,
  p_delivery_address text,
  p_payment payment_method,
  p_client_request_id text default null,
  p_delivery_barangay text default null,
  -- The number the rider calls for THIS delivery (0098). Null falls back
  -- to the account's number, so an app that does not send one still works.
  p_contact_phone text default null
)
returns table (
  order_id text,
  reference text,
  total numeric,
  status order_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_quantity constant int := 50;
  c_max_lines constant int := 30;
  c_max_open_orders constant int := 3;

  v_customer_name text;
  v_customer_phone text;
  v_contact_phone text;
  v_restaurant_name text;
  v_restaurant_open boolean;
  v_prep_minutes int;
  v_item record;
  v_qty int;
  v_menu_id text;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_total numeric;
  v_delivery_fee numeric;
  v_service_fee numeric;
  v_fee_agreed boolean;
  v_order_id text;
  v_reference text;
  v_address text := nullif(btrim(coalesce(p_delivery_address, '')), '');
  v_request_id text := nullif(btrim(coalesce(p_client_request_id, '')), '');
  v_barangay text := nullif(btrim(coalesce(p_delivery_barangay, '')), '');
  v_existing orders;
begin
  -- Resolved BEFORE the idempotency check so the fee is known even on a retry,
  -- but the retry path below returns the original order and never re-prices.
  select f.delivery_fee, f.service_fee, f.fee_agreed_in_person
    into v_delivery_fee, v_service_fee, v_fee_agreed
    from public.order_fees(v_barangay) f;

  if auth.uid() is null then
    raise exception 'Sign in to place an order.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from app_users where user_id = auth.uid() and role = 'customer'
  ) then
    raise exception 'This action is for customers only.'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from customers
     where user_id = auth.uid()
       and (blocked_at is not null or archived_at is not null)
  ) then
    raise exception 'Your account cannot place orders right now. Please contact support.'
      using errcode = '42501';
  end if;

  -- A retry of an order that already went through returns that order, before
  -- any check that the first attempt itself might now fail.
  if v_request_id is not null then
    select * into v_existing
      from orders o
     where o.customer_user_id = auth.uid()
       and o.client_request_id = v_request_id;
    if found then
      return query
        select v_existing.id, v_existing.reference, v_existing.total, v_existing.status;
      return;
    end if;
  end if;

  if p_restaurant_id is null or btrim(p_restaurant_id) = '' then
    raise exception 'Choose a restaurant.';
  end if;

  select r.name, r.is_open, r.prep_minutes
    into v_restaurant_name, v_restaurant_open, v_prep_minutes
    from restaurants r
   where r.id = p_restaurant_id
     and r.status = 'active'
     and r.archived_at is null;

  if v_restaurant_name is null then
    raise exception 'That restaurant is not taking orders.';
  end if;

  if not v_restaurant_open then
    raise exception '% is closed right now.', v_restaurant_name using errcode = '22023';
  end if;

  if p_payment is null or p_payment not in ('cash', 'e_wallet') then
    raise exception 'Choose cash on delivery or GCash.' using errcode = '22023';
  end if;

  if v_address is null or length(v_address) < 8 then
    raise exception 'Enter your full delivery address.' using errcode = '22023';
  end if;

  -- Service area AND pricing, enforced together. A published list with no band
  -- for this barangay cannot be charged, so it is refused here rather than
  -- ordered at an unknown price. A NULL fee that IS flagged agreed-in-person is
  -- allowed through: that one is a real arrangement, not a missing price.
  if exists (select 1 from service_areas) then
    if v_barangay is null then
      raise exception 'Choose your barangay.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from service_areas sa where lower(sa.barangay) = lower(v_barangay)
    ) then
      raise exception 'We do not deliver to % yet.', p_delivery_barangay using errcode = '22023';
    end if;
    if v_delivery_fee is null and not v_fee_agreed then
      raise exception 'We cannot deliver to % yet.', p_delivery_barangay using errcode = '22023';
    end if;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.';
  end if;

  if jsonb_array_length(p_items) > c_max_lines then
    raise exception 'That is too many different items for one order.' using errcode = '22023';
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

  -- The number the rider calls is the one for THIS delivery (0098), not the
  -- account's: the customer chose an address and gave the number that goes
  -- with it. The account's number is only the fallback, so an order placed by
  -- an app that does not send one still goes through -- and the account is
  -- never written to, because one address's number must not quietly replace
  -- the customer's own number.
  v_contact_phone := nullif(btrim(coalesce(p_contact_phone, '')), '');
  if v_contact_phone is null then
    v_contact_phone := v_customer_phone;
  end if;

  if v_contact_phone is null then
    raise exception 'Add a contact number so your rider can reach you.' using errcode = '22023';
  end if;

  -- The same rule the app applies (address-validation.ts): 7 to 15 digits,
  -- and nothing but digits, spaces and the punctuation a number is written
  -- with. The number is read by a rider at the door and dialled by hand.
  if length(regexp_replace(v_contact_phone, '[^0-9]', '', 'g')) < 7
     or length(regexp_replace(v_contact_phone, '[^0-9]', '', 'g')) > 15
     or v_contact_phone ~ '[^0-9+()\-[:space:]]' then
    raise exception 'Enter a valid contact number, e.g. 0917 123 4567.' using errcode = '22023';
  end if;

  v_customer_phone := v_contact_phone;

  if (
    select count(*) from orders o
     where o.customer_user_id = auth.uid()
       and o.status in ('pending', 'confirmed', 'preparing', 'out_for_delivery')
  ) >= c_max_open_orders then
    raise exception 'You already have % orders on the way. Wait for one to arrive first.', c_max_open_orders
      using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_menu_id := v_item.value ->> 'menu_item_id';
    v_qty := (v_item.value ->> 'quantity')::int;

    if v_menu_id is null or v_qty is null then
      raise exception 'Cart lines must carry menu_item_id and quantity.';
    end if;
    if v_qty <= 0 then
      raise exception 'Cart quantities must be positive.';
    end if;
    if v_qty > c_max_quantity then
      raise exception 'You can order at most % of one item.', c_max_quantity using errcode = '22023';
    end if;

    if not exists (
      select 1 from menu_items m
       where m.id = v_menu_id
         and m.restaurant_id = p_restaurant_id
         and m.available = true
    ) then
      raise exception 'One or more items are no longer available.';
    end if;

    select (m.price * v_qty) into v_line_total
      from menu_items m where m.id = v_menu_id;

    v_subtotal := v_subtotal + v_line_total;
  end loop;

  -- Frozen, not read again later. Editing a service_areas band must not
  -- reprice orders already placed.
  v_delivery_fee := coalesce(v_delivery_fee, 0);
  v_total := v_subtotal + v_delivery_fee + v_service_fee;
  v_reference := public.mint_order_reference();

  insert into orders (
    reference, customer, restaurant, restaurant_id,
    items, subtotal, delivery_fee, service_fee, total,
    status, payment, placed_at, rider, customer_user_id,
    delivery_address, delivery_barangay, customer_phone,
    client_request_id, prep_minutes, fee_agreed_in_person
  )
  select
    v_reference,
    v_customer_name,
    v_restaurant_name,
    p_restaurant_id,
    (
      select jsonb_agg(
        jsonb_build_object(
          'menu_item_id', m.id,
          'name', m.name,
          'quantity', (it.value ->> 'quantity')::int,
          'price', m.price
        )
      )
      from jsonb_array_elements(p_items) it
      join menu_items m on m.id = (it.value ->> 'menu_item_id')
    ),
    v_subtotal,
    v_delivery_fee,
    v_service_fee,
    v_total,
    'pending'::order_status,
    p_payment,
    now(),
    null,
    auth.uid(),
    v_address,
    v_barangay,
    v_customer_phone,
    v_request_id,
    v_prep_minutes,
    coalesce(v_fee_agreed, false)
  returning id into v_order_id;

  return query
    select v_order_id, v_reference, v_total, 'pending'::order_status;
end;
$$;

drop function if exists public.customer_place_delivery(jsonb, text, payment_method, text, text);

create function public.customer_place_delivery(
  p_shops jsonb,
  p_delivery_address text,
  p_payment payment_method,
  p_client_request_id text default null,
  p_delivery_barangay text default null,
  -- The number the rider calls for THIS delivery (0098). Null falls back
  -- to the account's number, so an app that does not send one still works.
  p_contact_phone text default null
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
  v_contact_phone text;
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

  -- The number the rider calls is the one for THIS delivery (0098), not the
  -- account's: the customer chose an address and gave the number that goes
  -- with it. The account's number is only the fallback, so an order placed by
  -- an app that does not send one still goes through -- and the account is
  -- never written to, because one address's number must not quietly replace
  -- the customer's own number.
  v_contact_phone := nullif(btrim(coalesce(p_contact_phone, '')), '');
  if v_contact_phone is null then
    v_contact_phone := v_customer_phone;
  end if;

  if v_contact_phone is null then
    raise exception 'Add a contact number so your rider can reach you.' using errcode = '22023';
  end if;

  -- The same rule the app applies (address-validation.ts): 7 to 15 digits,
  -- and nothing but digits, spaces and the punctuation a number is written
  -- with. The number is read by a rider at the door and dialled by hand.
  if length(regexp_replace(v_contact_phone, '[^0-9]', '', 'g')) < 7
     or length(regexp_replace(v_contact_phone, '[^0-9]', '', 'g')) > 15
     or v_contact_phone ~ '[^0-9+()\-[:space:]]' then
    raise exception 'Enter a valid contact number, e.g. 0917 123 4567.' using errcode = '22023';
  end if;

  v_customer_phone := v_contact_phone;

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


comment on function public.customer_place_order(text, jsonb, text, payment_method, text, text, text)
  is 'Price a storefront cart from menu_items and create a pending order for the caller, at the delivery fee frozen for the destination barangay (0080). Customers only, not blocked or archived. Cash or e_wallet only, address and a contact number for this delivery (p_contact_phone, falling back to the profile phone) required, at most 50 of a line, 30 lines and 3 open orders. p_client_request_id makes retries idempotent. Totals are never accepted from the client.';

revoke all on function public.customer_place_order(text, jsonb, text, payment_method, text, text, text) from public;
revoke all on function public.customer_place_order(text, jsonb, text, payment_method, text, text, text) from anon;
grant execute on function public.customer_place_order(text, jsonb, text, payment_method, text, text, text) to authenticated;

comment on function public.customer_place_delivery(jsonb, text, payment_method, text, text, text)
  is 'Price a basket that may hold food from up to ten shops and create one trip with one order per shop (0090). Customers only, not blocked or archived. Cash or e_wallet only, address and a contact number for this delivery (p_contact_phone, falling back to the profile phone) required. The delivery fee is the barangay''s rate plus 10.00 for every extra shop and the service fee is charged once. p_client_request_id makes retries idempotent. Totals are never accepted from the client.';

revoke all on function public.customer_place_delivery(jsonb, text, payment_method, text, text, text) from public;
revoke all on function public.customer_place_delivery(jsonb, text, payment_method, text, text, text) from anon;
grant execute on function public.customer_place_delivery(jsonb, text, payment_method, text, text, text) to authenticated;
