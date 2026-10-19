-- --------------------------------------------------------------------------
-- customer_place_order: zonal fee, frozen on the order
-- --------------------------------------------------------------------------
--
-- Rebuilt from 0077 -- the LATEST definer. 0034 and 0076 both predate the
-- open-status check, the cart caps and the idempotency key, and writing from
-- either would drop them silently.
drop function if exists public.customer_place_order(text, jsonb, text, payment_method, text, text);

create function public.customer_place_order(
  p_restaurant_id text,
  p_items jsonb,
  p_delivery_address text,
  p_payment payment_method,
  p_client_request_id text default null,
  p_delivery_barangay text default null
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

  if v_customer_phone is null then
    raise exception 'Add a contact number so your rider can reach you.' using errcode = '22023';
  end if;

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

comment on function public.customer_place_order(text, jsonb, text, payment_method, text, text)
  is 'Price a storefront cart from menu_items and create a pending order for the caller, at the delivery fee frozen for the destination barangay (0080). Customers only, not blocked or archived. Cash or e_wallet only, address and profile phone required, at most 50 of a line, 30 lines and 3 open orders. p_client_request_id makes retries idempotent. Totals are never accepted from the client.';

revoke all on function public.customer_place_order(text, jsonb, text, payment_method, text, text) from public;
revoke all on function public.customer_place_order(text, jsonb, text, payment_method, text, text) from anon;
grant execute on function public.customer_place_order(text, jsonb, text, payment_method, text, text) to authenticated;

-- --------------------------------------------------------------------------
-- Admin sets a band, or marks a barangay as agreed-at-the-door
-- --------------------------------------------------------------------------
--
-- Writing the fee through a function rather than letting the admin table it
-- directly is what keeps "deliverable", "priced" and "agreed at the door" from
-- being three columns that disagree. One call sets all three consistently, and
-- the table itself keeps no INSERT for anon or authenticated.

create or replace function public.admin_set_service_area(
  p_barangay text,
  p_delivery_fee numeric,
  p_fee_agreed_in_person boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_barangay text := nullif(btrim(coalesce(p_barangay, '')), '');
  v_fee numeric;
begin
  if not exists (
    select 1 from app_users where user_id = auth.uid() and role = 'admin'
  ) then
    raise exception 'This action is for administrators only.' using errcode = '42501';
  end if;

  if v_barangay is null then
    raise exception 'Name the barangay.' using errcode = '22023';
  end if;

  v_fee := case when p_delivery_fee is null then null else round(p_delivery_fee, 2) end;

  -- Agreed-in-person and a real fee are contradictory, and a row in that state
  -- would quote a total the customer cannot pay and the rider cannot collect.
  if p_fee_agreed_in_person and v_fee is not null then
    raise exception 'A barangay agreed at the door cannot also have a fixed fee.'
      using errcode = '22023';
  end if;

  if v_fee is not null and v_fee < 0 then
    raise exception 'The delivery fee cannot be negative.' using errcode = '22023';
  end if;

  -- Conflict on lower(barangay), NOT on the primary key. The primary key is
  -- case-sensitive, so `on conflict (barangay)` would insert a duplicate when an
  -- admin typed different casing and leave the original rate in force. This
  -- targets the case-insensitive unique index added in 0080, so the existing row
  -- is updated whatever the casing.
  insert into service_areas (barangay, delivery_fee, fee_agreed_in_person)
  values (v_barangay, v_fee, coalesce(p_fee_agreed_in_person, false))
  on conflict (lower(barangay)) do update
     set barangay = excluded.barangay,
         delivery_fee = excluded.delivery_fee,
         fee_agreed_in_person = excluded.fee_agreed_in_person;
end;
$$;

comment on function public.admin_set_service_area(text, numeric, boolean)
  is 'Create or update a deliverable barangay and its delivery fee. A NULL fee marks it agreed-at-the-door instead of priced, and the two are mutually exclusive.';

revoke all on function public.admin_set_service_area(text, numeric, boolean) from public;
revoke all on function public.admin_set_service_area(text, numeric, boolean) from anon, authenticated;
grant execute on function public.admin_set_service_area(text, numeric, boolean) to authenticated;