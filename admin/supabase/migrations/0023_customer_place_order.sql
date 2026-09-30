-- --------------------------------------------------------------------------
-- Storefront order creation (customer_place_order)
--
-- The customer-facing counterpart to the read-only browse path (0021). A
-- customer submits what they want; this function prices it, mints the
-- reference, and writes the order. It is the ONLY writer of orders reachable
-- from the customer app.
--
-- Why a function instead of policies:
--
--   * Pricing is the security boundary. The items arrive as
--     [{menu_item_id, quantity}]. Subtotal is computed here from menu_items.price
--     -- never accepted from the client -- so "pay whatever the app says" is
--     structurally impossible. The same applies to delivery_fee/service_fee
--     (flat 45.00 / 5.00, stored so the receipt matches the charge).
--
--   * Status/placement invariants are enforced in one place: an order starts
--     'pending', belongs to the caller, and is pinned to the restaurant the
--     items came from. A client-side insert policy would recompute these
--     everywhere the app grows.
--
-- SECURITY DEFINER, so it must re-establish who is allowed to call it: a
-- customer, and a customer only. Mirrors 0011/0018 re-checks.
--
-- Items are validated the same way the merchant UI would price them:
--   * every menu_item_id must exist, belong to the target restaurant, and be
--     available (the merchant's own "stop selling this" switch);
--   * quantity must be a positive integer;
--   * an empty cart is refused.
-- If any line fails, nothing is written (single insert at the end).
--
-- Returns the minted order so the app can bounce straight to /track?ref=...
-- without a second round trip.
-- --------------------------------------------------------------------------

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
  v_delivery_fee numeric := 45.00;
  v_service_fee numeric := 5.00;
  v_order_id text;
  v_reference text;
begin
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
  is 'Price a storefront cart from menu_items and create a pending order for the caller. Customers only; totals are never accepted from the client.';

revoke all on function public.customer_place_order(text, jsonb, text, payment_method) from public;
revoke all on function public.customer_place_order(text, jsonb, text, payment_method) from anon;
grant execute on function public.customer_place_order(text, jsonb, text, payment_method) to authenticated;