-- --------------------------------------------------------------------------
-- Server-authoritative order quote
--
-- The mobile checkout previewed the total from its own hardcoded DELIVERY_FEE
-- = 45 / SERVICE_FEE = 5, duplicated from the constants inside
-- customer_place_order (0023). Two copies of one price is one copy too many:
-- edit one and the customer is shown a total the server then contradicts at
-- checkout, which is the kind of disagreement a customer reads as a scam
-- rather than a rounding difference. customer/index.tsx held a third copy for
-- its "₱45 delivery" storefront copy.
--
-- quote_order makes the server the single source of truth and lets the client
-- preview from it. The pricing and the availability check mirror
-- customer_place_order exactly, so a quote that succeeds is an order that will
-- be accepted -- the two functions must be kept in step, and if the fees ever
-- become per-restaurant this is the one place they are defined for the client.
--
-- Callable by anon: a cart can be priced before deciding to sign in. Placing
-- the order still requires auth, which customer_place_order enforces on
-- auth.uid().
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- The one definition of the fees
-- --------------------------------------------------------------------------
-- Both order functions read the fees from here. Two functions each carrying
-- their own copy of 45.00/5.00 is the drift this migration exists to remove, so
-- adding quote_order without touching customer_place_order would have left the
-- duplication in place one layer down.
--
-- A function rather than a config table: the fees are flat and platform-wide,
-- there is nothing to edit at runtime, and a table would need RLS, grants and an
-- admin surface to be worth it. Revisit when fees become per-restaurant.
create or replace function public.order_fees()
returns table (
  delivery_fee numeric,
  service_fee numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select 45.00::numeric, 5.00::numeric;
$$;

comment on function public.order_fees()
  is 'The platform delivery and service fees, in one place. Read by quote_order and customer_place_order so the preview and the charge cannot disagree.';

revoke all on function public.order_fees() from public;
grant execute on function public.order_fees() to anon, authenticated;


-- --------------------------------------------------------------------------
-- quote_order
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

  -- Anon may preview a cart before deciding to sign in; placing the order
  -- still requires auth via customer_place_order.
  if p_restaurant_id is null or btrim(p_restaurant_id) = '' then
    raise exception 'Pick a restaurant first.' using errcode = '22023';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.' using errcode = '22023';
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
  is 'Server-authoritative price preview for a cart. Mirrors the pricing and availability checks in customer_place_order() so the preview and the charge cannot disagree. Callable by anon.';

revoke all on function public.quote_order(text, jsonb) from public;
grant execute on function public.quote_order(text, jsonb) to anon, authenticated;
-- --------------------------------------------------------------------------
-- customer_place_order: read the same fees
-- --------------------------------------------------------------------------
-- Redefined only to swap its two inline literals for order_fees(). Everything
-- else is byte-for-byte 0023's body: same validation, same single insert at the
-- end, same auth and role re-checks. Left in place rather than edited in 0023
-- because 0023 is already applied in production.
create or replace function public.customer_place_order(
  p_restaurant_id text,
  p_items jsonb,
  p_delivery_address text,
  p_payment payment_method
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
  v_customer_name text;
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
begin
  -- Fees come from order_fees() (0033), the single definition shared with
  -- quote_order, so the preview a customer sees and the amount charged come
  -- from one place.
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

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.';
  end if;

  -- Resolve the customer's display name from the auth account: metadata name,
  -- else the email local part, else a plain fallback. orders.customer is a
  -- free-text name, so something readable has to land on the receipt.
  select
    coalesce(
      nullif(btrim(raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(email, '@', 1), ''),
      'Customer'
    )
    into v_customer_name
  from auth.users
  where id = auth.uid();

  -- Price from the menu table, never for the client. Every line is validated
  -- against the target restaurant and its availability before it can count.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_menu_id := v_item.value ->> 'menu_item_id';
    v_qty := (v_item.value -> 'quantity')::int;

    if v_menu_id is null or v_qty is null then
      raise exception 'Cart lines must carry menu_item_id and quantity.';
    end if;
    if v_qty <= 0 then
      raise exception 'Cart quantities must be positive.';
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
    status, payment, placed_at, rider, customer_user_id, delivery_address
  )
  select
    v_reference,
    v_customer_name,
    v_restaurant_name,
    p_restaurant_id,
    (
      select jsonb_agg(
        jsonb_build_object(
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
    nullif(btrim(coalesce(p_delivery_address, '')), '')
  returning id into v_order_id;

  return query
    select v_order_id, v_reference, v_total, 'pending'::order_status;
end;
$$;

comment on function public.customer_place_order(text, jsonb, text, payment_method)
  is 'Price a storefront cart from menu_items and create a pending order for the caller. Customers only; totals are never accepted from the client. Fees come from order_fees().';

revoke all on function public.customer_place_order(text, jsonb, text, payment_method) from public;
revoke all on function public.customer_place_order(text, jsonb, text, payment_method) from anon;
grant execute on function public.customer_place_order(text, jsonb, text, payment_method) to authenticated;
