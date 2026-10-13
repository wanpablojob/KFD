-- --------------------------------------------------------------------------
-- Store status, service area, delivery estimate and account deletion
--
-- 1. OPEN / CLOSED AND PREP TIME. Customers could order from a kitchen that
--    was closed. restaurants.is_open and prep_minutes, set by the merchant
--    through merchant_set_store_status; quote_order and customer_place_order
--    refuse a closed restaurant. The order snapshots prep_minutes so its
--    delivery estimate does not move if the merchant changes the setting later.
-- 2. SERVICE AREA. service_areas lists the barangays KFD delivers to. While it
--    is empty (the owner has not published the list yet) every address is
--    accepted, as before; once it has rows, an order must name one of them.
--    The barangay is stored on the order for the rider and for reporting.
-- 3. DELIVERY ESTIMATE. track_order returns the order's prep_minutes so the
--    app can show an arrival window.
-- 4. ACCOUNT DELETION. The app stores require it. delete_my_account removes a
--    customer's login and scrubs the personal data on their past orders and
--    CRM row, keeping the money records. Riders and merchants are excluded:
--    their accounts carry payouts and restaurant access an operator must close.
--
-- customer_place_order, quote_order, search_restaurants and track_order are
-- rebuilt from their latest definitions (0076, 0076, 0029, 0052).
-- --------------------------------------------------------------------------

alter table restaurants add column if not exists is_open boolean not null default true;
alter table restaurants add column if not exists prep_minutes int not null default 20;
alter table restaurants drop constraint if exists restaurants_prep_minutes_range;
alter table restaurants add constraint restaurants_prep_minutes_range
  check (prep_minutes between 5 and 120);

alter table orders add column if not exists prep_minutes int;
alter table orders add column if not exists delivery_barangay text;

comment on column restaurants.is_open is 'Merchant-controlled: false means the kitchen is not taking orders right now (0077).';
comment on column restaurants.prep_minutes is 'Merchant estimate of minutes to prepare a typical order; feeds the customer delivery estimate (0077).';
comment on column orders.prep_minutes is 'restaurants.prep_minutes snapshotted when the order was placed (0077).';
comment on column orders.delivery_barangay is 'Barangay the customer chose from service_areas, when the list is published (0077).';

-- --------------------------------------------------------------------------
-- service_areas
-- --------------------------------------------------------------------------
create table if not exists public.service_areas (
  barangay text primary key check (length(btrim(barangay)) > 0),
  created_at timestamptz not null default now()
);
comment on table public.service_areas is
  'Barangays KFD delivers to. Empty means not yet published, and then no address is refused (0077).';

alter table public.service_areas enable row level security;
drop policy if exists "anyone reads service areas" on public.service_areas;
create policy "anyone reads service areas"
  on public.service_areas for select to anon, authenticated using (true);
drop policy if exists "admins manage service areas" on public.service_areas;
create policy "admins manage service areas"
  on public.service_areas for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
grant select on public.service_areas to anon, authenticated;
grant insert, update, delete on public.service_areas to authenticated;

-- --------------------------------------------------------------------------
-- merchant_set_store_status
-- --------------------------------------------------------------------------
create or replace function public.merchant_set_store_status(
  p_is_open boolean,
  p_prep_minutes int default null
)
returns table (is_open boolean, prep_minutes int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant text := public.current_merchant_restaurant();
begin
  if auth.uid() is null or v_restaurant is null then
    raise exception 'Only a restaurant''s merchant can change its store status.'
      using errcode = '42501';
  end if;
  if p_is_open is null then
    raise exception 'Choose open or closed.' using errcode = '22023';
  end if;
  if p_prep_minutes is not null and (p_prep_minutes < 5 or p_prep_minutes > 120) then
    raise exception 'Prep time must be between 5 and 120 minutes.' using errcode = '22023';
  end if;

  return query
    update restaurants r
       set is_open = p_is_open,
           prep_minutes = coalesce(p_prep_minutes, r.prep_minutes),
           updated_at = now()
     where r.id = v_restaurant
    returning r.is_open, r.prep_minutes;
end;
$$;
comment on function public.merchant_set_store_status(boolean, int)
  is 'The calling merchant opens or closes their own restaurant and optionally sets its prep time (5-120 min). 0077.';
revoke all on function public.merchant_set_store_status(boolean, int) from public;
revoke all on function public.merchant_set_store_status(boolean, int) from anon;
grant execute on function public.merchant_set_store_status(boolean, int) to authenticated;

-- --------------------------------------------------------------------------
-- search_restaurants: rebuilt from 0029, plus is_open and prep_minutes
-- --------------------------------------------------------------------------
drop function if exists public.search_restaurants(text, text);
create function public.search_restaurants(
  p_query text default null,
  p_cuisine text default null
)
returns table (
  id text,
  name text,
  cuisine text,
  city text,
  rating numeric,
  status restaurant_status,
  archived_at timestamptz,
  is_open boolean,
  prep_minutes int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text;
begin
  if not public.is_customer() then
    raise exception 'This action is for customers only.'
      using errcode = '42501';
  end if;

  v_q := nullif(btrim(coalesce(p_query, '')), '');
  v_q := lower(v_q);

  return query
    select
      r.id,
      r.name,
      r.cuisine,
      r.city,
      r.rating,
      r.status,
      r.archived_at,
      r.is_open,
      r.prep_minutes
    from restaurants r
    where r.status = 'active'
      and r.archived_at is null
      and (p_cuisine is null or p_cuisine = '' or r.cuisine = p_cuisine)
      and (
        v_q is null
        or lower(r.name) like '%' || v_q || '%'
        or lower(r.cuisine) like '%' || v_q || '%'
      )
    -- Open kitchens first, so a closed one never sits above one you can order from.
    order by r.is_open desc, r.name;
end;
$$;
comment on function public.search_restaurants(text, text)
  is 'Active, non-archived restaurants matching a name/cuisine substring and optional cuisine, open ones first, with open status and prep time (0077). Customers only.';
revoke all on function public.search_restaurants(text, text) from public;
revoke all on function public.search_restaurants(text, text) from anon;
grant execute on function public.search_restaurants(text, text) to authenticated;

-- --------------------------------------------------------------------------
-- quote_order: rebuilt from 0076, plus the closed check
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

  if not (select r.is_open from restaurants r where r.id = p_restaurant_id) then
    raise exception 'This restaurant is closed right now.' using errcode = '22023';
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
  is 'Server-authoritative price preview for a cart. Mirrors the pricing, availability, open-status and cart-size checks in customer_place_order so the preview and the charge cannot disagree. Callable by anon.';
revoke all on function public.quote_order(text, jsonb) from public;
grant execute on function public.quote_order(text, jsonb) to anon, authenticated;

-- --------------------------------------------------------------------------
-- customer_place_order: rebuilt from 0076, plus closed check, service area,
-- and the prep_minutes / barangay snapshot
-- --------------------------------------------------------------------------
drop function if exists public.customer_place_order(text, jsonb, text, payment_method, text);

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
  v_order_id text;
  v_reference text;
  v_address text := nullif(btrim(coalesce(p_delivery_address, '')), '');
  v_request_id text := nullif(btrim(coalesce(p_client_request_id, '')), '');
  v_barangay text := nullif(btrim(coalesce(p_delivery_barangay, '')), '');
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
    raise exception 'This restaurant is closed right now.' using errcode = '22023';
  end if;

  if p_payment is null or p_payment not in ('cash', 'e_wallet') then
    raise exception 'Choose cash on delivery or GCash.' using errcode = '22023';
  end if;

  if v_address is null or length(v_address) < 8 then
    raise exception 'Enter your full delivery address.' using errcode = '22023';
  end if;

  -- Service area: enforced only once the owner has published the list.
  if exists (select 1 from service_areas) then
    if v_barangay is null then
      raise exception 'Choose your barangay.' using errcode = '22023';
    end if;
    select sa.barangay into v_barangay
      from service_areas sa
     where lower(sa.barangay) = lower(v_barangay);
    if not found then
      raise exception 'We do not deliver to % yet.', p_delivery_barangay using errcode = '22023';
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
    customer_phone, client_request_id, prep_minutes, delivery_barangay
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
    v_request_id,
    v_prep_minutes,
    v_barangay
  returning id into v_order_id;

  return query
    select v_order_id, v_reference, v_total, 'pending'::order_status;
end;
$$;
comment on function public.customer_place_order(text, jsonb, text, payment_method, text, text)
  is 'Price a storefront cart from menu_items and create a pending order for the caller. Customers only, not blocked or archived; restaurant must be open; cash or e_wallet only; address and profile phone required; barangay must be in service_areas once that list is published; at most 50 of a line, 30 lines and 3 open orders. p_client_request_id makes retries idempotent. Totals are never accepted from the client. 0076-0077.';

revoke all on function public.customer_place_order(text, jsonb, text, payment_method, text, text) from public;
revoke all on function public.customer_place_order(text, jsonb, text, payment_method, text, text) from anon;
grant execute on function public.customer_place_order(text, jsonb, text, payment_method, text, text) to authenticated;

-- --------------------------------------------------------------------------
-- track_order: rebuilt from 0052, plus prep_minutes for the estimate
-- --------------------------------------------------------------------------
drop function if exists public.track_order(text);
create function public.track_order(p_reference text)
returns table (
  reference text,
  restaurant text,
  items jsonb,
  subtotal numeric,
  delivery_fee numeric,
  service_fee numeric,
  total numeric,
  status order_status,
  payment payment_method,
  placed_at timestamptz,
  delivery_address text,
  prep_minutes int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row orders;
  v_ref text;
begin
  if p_reference is null or btrim(p_reference) = '' then
    return;
  end if;

  v_ref := upper(replace(btrim(p_reference), '#', ''));

  select * into v_row
    from orders o
   where upper(replace(o.reference, '#', '')) = v_ref
   limit 1;

  if not found then
    return;
  end if;

  if v_row.reference !~ '^#KFD-[0-9A-F]{12}$' then
    -- Legacy sequential reference: only an already entitled caller may read it.
    if not (
      exists (
        select 1 from app_users
         where user_id = auth.uid() and role = 'admin'
      )
      or (
        v_row.restaurant_id is not null
        and exists (
          select 1 from app_users
           where user_id = auth.uid()
             and role = 'merchant'
             and restaurant_id = v_row.restaurant_id
        )
      )
      or (v_row.customer_user_id is not null and v_row.customer_user_id = auth.uid())
    ) then
      return;
    end if;
  end if;

  return query
    select
      v_row.reference,
      v_row.restaurant,
      v_row.items,
      v_row.subtotal,
      v_row.delivery_fee,
      v_row.service_fee,
      v_row.total,
      v_row.status,
      v_row.payment,
      v_row.placed_at,
      -- PII gate: the address is only for the order's own customer.
      case
        when v_row.customer_user_id is not null
         and v_row.customer_user_id = auth.uid()
        then v_row.delivery_address
        else null
      end,
      v_row.prep_minutes;
end;
$$;
comment on function public.track_order(text)
  is 'Public order tracking by reference. Returns the order projection, with the fee breakdown and the prep_minutes snapshot for the delivery estimate (0077). delivery_address is returned only to the order''s own customer; every other caller gets NULL.';
revoke all on function public.track_order(text) from public;
grant execute on function public.track_order(text) to anon, authenticated;

-- --------------------------------------------------------------------------
-- delete_my_account
-- --------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to delete your account.' using errcode = '42501';
  end if;

  if not exists (select 1 from app_users where user_id = v_uid and role = 'customer') then
    raise exception 'Rider and restaurant accounts are closed by KFD support, because they carry payouts and store access.'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from orders o
     where o.customer_user_id = v_uid
       and o.status in ('pending', 'confirmed', 'preparing', 'out_for_delivery')
  ) then
    raise exception 'You have an order on the way. Delete your account after it arrives.'
      using errcode = '22023';
  end if;

  -- Keep the money records, drop who they were. Orders and the CRM row stay for
  -- accounting; the person's name, phone and address do not.
  update orders
     set customer = 'Deleted customer',
         customer_phone = null,
         delivery_address = null
   where customer_user_id = v_uid;

  update customers
     set name = 'Deleted customer',
         -- email is not null; .invalid is reserved and can never receive mail.
         email = 'deleted-' || id || '@deleted.invalid',
         phone = null,
         archived_at = coalesce(archived_at, now())
   where user_id = v_uid;

  -- Cascades app_users and push_tokens; sets orders.customer_user_id and
  -- customers.user_id to null.
  delete from auth.users where id = v_uid;
end;
$$;
comment on function public.delete_my_account()
  is 'A customer deletes their own login and the personal data on their orders and CRM row; money records stay. Refused while an order is in flight, and for rider and merchant accounts (0077).';
revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;
