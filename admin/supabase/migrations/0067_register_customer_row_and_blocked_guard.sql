-- --------------------------------------------------------------------------
-- register_customer also creates the customers row; blocked customers cannot order
--
-- Two related gaps closed here, both because 0066 gave customers.user_id:
--
--   * A signup produced an app_users row and nothing else, so the person never
--     appeared on /dashboard/customers. register_customer now writes the
--     `customers` row in the same transaction-ish call, which is what makes the
--     storefront's accounts visible to the operator at all.
--
--   * `archived_at` / `blocked_at` (0066) would have been decorative without an
--     enforcement point. customer_place_order now refuses a blocked or archived
--     account, which is the only place a customer turns into an order.
--
-- Idempotency, unchanged and load-bearing: register_customer is called after
-- every first role resolution fails, on every device. `on conflict (user_id) do
-- nothing` makes the second call a no-op, and the early return for an account
-- that already has a role still runs first, so provisioning an existing signup
-- as a merchant/rider/admin is never undone here.
--
-- Name and email resolution mirror customer_place_order (0033) exactly, so the
-- name on the customer record is the name on the receipt. There is no email or
-- phone parameter: auth.uid() is the only identity accepted.
-- --------------------------------------------------------------------------

create or replace function public.register_customer()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to create your customer account.'
      using errcode = '42501';
  end if;

  -- Never touch a provisioned account. Whatever role this account already has
  -- (including a NULL-role placeholder, which is not a thing the schema allows)
  -- stays. The inserts below are the only code paths that write.
  if exists (
    select 1 from app_users where user_id = auth.uid()
  ) then
    return;
  end if;

  insert into app_users (user_id, role)
  values (auth.uid(), 'customer');

  -- The operator-facing customer record. Same resolution order as 0033's
  -- customer_place_order: metadata name, else the email local part, else a plain
  -- fallback, because customers.name is required and free text.
  select
    coalesce(email, ''),
    coalesce(
      nullif(btrim(raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(email, ''), '@', 1), ''),
      'Customer'
    )
    into v_email, v_name
  from auth.users
  where id = auth.uid();

  -- customers.email is NOT NULL UNIQUE. A row already holding this email that is
  -- not this account is not ours to overwrite, and failing here is correct: it
  -- means two accounts claim one address, which an operator must resolve.
  if v_email = '' then
    raise exception 'This account has no email address to record on the customer.'
      using errcode = 'P0001';
  end if;

  insert into customers (id, user_id, name, email)
  values (
    'cus_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    auth.uid(),
    v_name,
    v_email
  )
  on conflict (user_id) do nothing;
end;
$$;

comment on function public.register_customer()
  is 'Insert an app_users row making the current signed-in user a customer, plus the operator-facing customers row (0066). Idempotent: no-op when the account already has any role or customer row.';

revoke all on function public.register_customer() from public;
revoke all on function public.register_customer() from anon;
grant execute on function public.register_customer() to authenticated;

-- --------------------------------------------------------------------------
-- customer_place_order: refuse a blocked or archived customer
--
-- Placed with the 0033 body otherwise, byte for byte. One guard added, after the
-- role check and before the restaurant lookup, because it is a property of the
-- caller rather than of the cart.
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
  v_delivery_fee numeric;
  v_service_fee numeric;
  v_order_id text;
  v_reference text;
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

  -- Blocked or archived (0066). Security definer, so this holds whatever the
  -- table policies say, and it is checked before anything is priced so a
  -- blocked account learns why without a cart being quoted.
  if exists (
    select 1 from customers
     where user_id = auth.uid()
       and (blocked_at is not null or archived_at is not null)
  ) then
    raise exception 'Your account cannot place orders right now. Please contact support.'
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

  select
    coalesce(
      nullif(btrim(raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(email, '@', 1), ''),
      'Customer'
    )
    into v_customer_name
  from auth.users
  where id = auth.uid();

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
    nullif(btrim(coalesce(p_delivery_address, '')), '')
  returning id into v_order_id;

  return query
    select v_order_id, v_reference, v_total, 'pending'::order_status;
end;
$$;

comment on function public.customer_place_order(text, jsonb, text, payment_method)
  is 'Price a storefront cart from menu_items and create a pending order for the caller. Customers only, and not blocked or archived (0066). Totals are never accepted from the client. Fees come from order_fees(). Each line carries menu_item_id so reorder is exact.';

revoke all on function public.customer_place_order(text, jsonb, text, payment_method) from public;
revoke all on function public.customer_place_order(text, jsonb, text, payment_method) from anon;
grant execute on function public.customer_place_order(text, jsonb, text, payment_method) to authenticated;