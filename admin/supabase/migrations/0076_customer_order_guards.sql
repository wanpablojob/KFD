-- --------------------------------------------------------------------------
-- Customer order guards
--
-- customer_place_order trusted the app for everything except prices. This
-- closes what a modified client (or a bad network) could do with that:
--
-- 1. THE CUSTOMER PHONE WAS DROPPED. 0037 copied the profile phone onto the
--    order so the rider can call; 0053 rebuilt the function from an older body
--    and lost it, and 0067 carried that forward. Restored, and now required:
--    a rider with no number cannot reach the door.
-- 2. 'card' WAS ACCEPTED. The app offers cash and GCash only, there is no card
--    gateway, and the rider app shows no "collect cash" for a card order, so a
--    tampered client could order unpaid food. Only cash and e_wallet are taken.
-- 3. NO ADDRESS WAS REQUIRED. The app validates it; the server stored NULL.
-- 4. NO LIMITS. Unbounded quantities, lines and open orders made fake
--    cash-on-delivery orders free to send. Capped per line, per cart, and per
--    customer's open orders.
-- 5. A RETRY COULD DOUBLE-ORDER. If the response was lost after the insert,
--    tapping again created a second order. An optional client request id now
--    returns the existing order instead.
--
-- quote_order gets the same cart caps so the preview fails where the order
-- would. cancel_order now allows only 'pending': once the restaurant confirms,
-- it may be cooking (the same rule Foodpanda and Grab apply).
--
-- Bodies are rebuilt from the latest definitions (customer_place_order 0067,
-- quote_order 0034, cancel_order 0054), plus the guards above.
-- --------------------------------------------------------------------------

alter table orders add column if not exists client_request_id text;
alter table orders drop constraint if exists orders_client_request_id_len;
alter table orders add constraint orders_client_request_id_len
  check (client_request_id is null or length(client_request_id) between 8 and 64);
create unique index if not exists orders_customer_client_request_uniq
  on orders (customer_user_id, client_request_id)
  where client_request_id is not null;

comment on column orders.client_request_id is
  'Idempotency key from the customer app: a retried customer_place_order with the same key returns the existing order instead of creating another (0076).';

-- --------------------------------------------------------------------------
-- customer_place_order: rebuilt from 0067, plus the guards above
-- --------------------------------------------------------------------------
drop function if exists public.customer_place_order(text, jsonb, text, payment_method);

create function public.customer_place_order(
  p_restaurant_id text,
  p_items jsonb,
  p_delivery_address text,
  p_payment payment_method,
  p_client_request_id text default null
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
  -- Limits. A family order fits comfortably; a prank order does not.
  c_max_quantity constant int := 50;
  c_max_lines constant int := 30;
  c_max_open_orders constant int := 3;

  v_customer_name text;
  v_customer_phone text;
  v_restaurant_name text;
  v_item record;
  v_qty int;
  v_menu_id text;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_total numeric;
  v_delivery_fee numeric;
  v_service_fee numeric;
  v_order_id text;
  v_reference text;
  v_address text := nullif(btrim(coalesce(p_delivery_address, '')), '');
  v_request_id text := nullif(btrim(coalesce(p_client_request_id, '')), '');
  v_existing orders;
begin
  select f.delivery_fee, f.service_fee
    into v_delivery_fee, v_service_fee
    from public.order_fees() f;

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
  -- any check that the first attempt itself might now fail (open-order cap).
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

  select r.name into v_restaurant_name
    from restaurants r
   where r.id = p_restaurant_id
     and r.status = 'active'
     and r.archived_at is null;

  if v_restaurant_name is null then
    raise exception 'That restaurant is not taking orders.';
  end if;

  if p_payment is null or p_payment not in ('cash', 'e_wallet') then
    raise exception 'Choose cash on delivery or GCash.' using errcode = '22023';
  end if;

  if v_address is null or length(v_address) < 8 then
    raise exception 'Enter your full delivery address.' using errcode = '22023';
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
    v_qty := (v_item.value -> 'quantity')::int;

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

  v_total := v_subtotal + v_delivery_fee + v_service_fee;
  v_reference := public.mint_order_reference();

  insert into orders (
    reference, customer, restaurant, restaurant_id,
    items, subtotal, delivery_fee, service_fee, total,
    status, payment, placed_at, rider, customer_user_id, delivery_address,
    customer_phone, client_request_id
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
          'quantity', (it.value -> 'quantity')::int,
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
    v_customer_phone,
    v_request_id
  returning id into v_order_id;

  return query
    select v_order_id, v_reference, v_total, 'pending'::order_status;
end;
$$;
comment on function public.customer_place_order(text, jsonb, text, payment_method, text)
  is 'Price a storefront cart from menu_items and create a pending order for the caller. Customers only, not blocked or archived. Cash or e_wallet only, address and profile phone required, at most 50 of a line, 30 lines and 3 open orders. p_client_request_id makes retries idempotent (0076). Totals are never accepted from the client.';

revoke all on function public.customer_place_order(text, jsonb, text, payment_method, text) from public;
revoke all on function public.customer_place_order(text, jsonb, text, payment_method, text) from anon;
grant execute on function public.customer_place_order(text, jsonb, text, payment_method, text) to authenticated;

-- --------------------------------------------------------------------------
-- quote_order: rebuilt from 0034, plus the same cart caps
-- --------------------------------------------------------------------------
create or replace function public.quote_order(
  p_restaurant_id text,
  p_items jsonb
)
returns table (
  subtotal numeric,
  delivery_fee numeric,
  service_fee numeric,
  total numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_max_quantity constant int := 50;
  c_max_lines constant int := 30;
  v_item record;
  v_qty int;
  v_menu_id text;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_delivery_fee numeric;
  v_service_fee numeric;
  v_matches int := 0;
begin
  select f.delivery_fee, f.service_fee
    into v_delivery_fee, v_service_fee
    from public.order_fees() f;

  if p_restaurant_id is null or btrim(p_restaurant_id) = '' then
    raise exception 'Pick a restaurant first.' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > c_max_lines then
    raise exception 'That is too many different items for one order.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from restaurants r
     where r.id = p_restaurant_id
       and r.status = 'active'
       and r.archived_at is null
  ) then
    raise exception 'That restaurant is not available right now.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_menu_id := v_item.value ->> 'menu_item_id';
    v_qty := coalesce((v_item.value ->> 'quantity')::int, 0);

    if v_qty <= 0 then
      raise exception 'Quantities must be at least 1.' using errcode = '22023';
    end if;
    if v_qty > c_max_quantity then
      raise exception 'You can order at most % of one item.', c_max_quantity using errcode = '22023';
    end if;

    select count(*) into v_matches
      from menu_items m
     where m.id = v_menu_id
       and m.restaurant_id = p_restaurant_id
       and m.available = true;

    if v_matches = 0 then
      raise exception 'One or more items are no longer available.' using errcode = '22023';
    end if;

    select (m.price * v_qty) into v_line_total
      from menu_items m where m.id = v_menu_id;

    v_subtotal := v_subtotal + v_line_total;
  end loop;

  return query
    select v_subtotal, v_delivery_fee, v_service_fee,
           v_subtotal + v_delivery_fee + v_service_fee;
end;
$$;
comment on function public.quote_order(text, jsonb)
  is 'Server-authoritative price preview for a cart. Mirrors the pricing, availability and cart-size checks in customer_place_order so the preview and the charge cannot disagree. Callable by anon.';

revoke all on function public.quote_order(text, jsonb) from public;
grant execute on function public.quote_order(text, jsonb) to anon, authenticated;

-- --------------------------------------------------------------------------
-- cancel_order: rebuilt from 0054, pending only
-- --------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id text)
returns table (
  order_id text,
  reference text,
  status order_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row orders;
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

  -- Once the restaurant confirms it may already be cooking.
  if v_row.status <> 'pending' then
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
$$;
comment on function public.cancel_order(text)
  is 'Customer-initiated cancellation, allowed only while the order is still pending (not yet accepted by the restaurant) and only for the order''s own customer (0076).';

revoke all on function public.cancel_order(text) from public;
revoke all on function public.cancel_order(text) from anon;
grant execute on function public.cancel_order(text) to authenticated;
