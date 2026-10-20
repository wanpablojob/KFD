-- --------------------------------------------------------------------------
-- 0090: multi-shop cart, one combined delivery
-- --------------------------------------------------------------------------
--
-- A customer can now order from up to ten restaurants in one checkout. The
-- food keeps one order row per shop -- so every merchant still sees, accepts,
-- prepares and rejects only its own part -- and a new parent row, a
-- DELIVERY, carries the trip: who it is for, where it goes, what it costs,
-- which rider took it, the proof photo and the cash collected.
--
-- Why a parent row at all
-- ----------------------
-- The old model was one order == one restaurant == one delivery. The money
-- (one delivery fee, one service fee, one cash collection) and the rider work
-- (one pickup, one drop-off) were both properties of that single order. With
-- several shops in one basket those become properties of the basket, not of any
-- one shop, so they need somewhere to live that is not a shop's order. Hence
-- `deliveries`.
--
-- What lives where
-- -----------------
--   deliveries        the trip: customer, address, barangay, phone, payment,
--                     fees (frozen), total, status, rider, proof, cash
--   orders.delivery_id  the link from a shop's part to its trip
--   delivery_offers   the trip's offers to riders (one offer per rider, not
--                     one per shop)
--   delivery_cash_collections  the cash collected for the trip, once
--
-- Orders that already exist keep working untouched: `orders.delivery_id` is
-- nullable and stays null for them, so the old per-order dispatch, payout and
-- cash paths still apply to exactly the rows they applied to before. Every new
-- checkout -- one shop or ten -- goes through customer_place_delivery and
-- therefore always has a delivery.
--
-- Fees
-- ----
-- delivery_fee = the service_areas rate for the barangay (0080/0084) + 10.00
-- for every shop after the first, because the rider makes extra stops. The
-- service fee stays 5.00 once per checkout, not once per shop. When the
-- barangay is agreed at the door the rate is NULL: the base fee is then
-- settled with the customer at the door and is not part of the total, but the
-- per-extra-shop surcharge is a known price and IS charged. Same rule as
-- 0080/0081 for the base fee.
--
-- Payout: per stop, not per trip
-- ------------------------------
-- A rider who collects from three kitchens is paid `rider_payout_per_delivery()`
-- for each of them, so a multi-shop trip pays more than a single-shop one. The
-- reason is that the ledger (rider_payouts) is per order and every consumer
-- of it -- disputes, cash handover, the rider's earnings, the admin payout
-- screen -- already works per order. The trip links them with
-- rider_payouts.delivery_id, and `riders.deliveries` counts trips, not stops.
--
-- Cash: once, for the trip
-- -------------------------
-- The customer pays one total, so the rider collects one amount, against the
-- DELIVERY's grand total, in delivery_cash_collections. The shops' orders
-- never carry a cash collection, so nothing is counted twice.
--
-- A shop that rejects
-- -------------------
-- A merchant may reject its part before the food is collected. That part is
-- dropped from the trip: the delivery is re-priced (the extra-shop surcharge
-- goes away with the shop, the service fee stays), the customer is told by the
-- notification route, and the remaining shops carry on. A rejection after the
-- rider has collected is refused (see orders_guard_client_status), because by
-- then the food exists and the money is a refund, not a re-price.
--
-- Dispatch: the trip, not the shop
-- --------------------------------
-- A trip is offered to riders once every shop in it has accepted, and one
-- rider claims the whole trip. The per-order auto-dispatch trigger skips
-- orders that belong to a delivery, so a three-shop trip produces one set of
-- offers, not three.
--
-- Rebuilt-from-live functions
-- ---------------------------
-- orders_auto_dispatch, orders_guard_client_status, rider_mark_delivered,
-- rider_report_failed_delivery, fetch_rider_orders_page, admin_rider_cash and
-- rider_cash_position are rebuilt from their live definitions
-- (pg_get_functiondef against the live database), not from older migrations.
-- Their live bodies are otherwise unchanged.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- Types
-- --------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'delivery_status') then
    create type public.delivery_status as enum (
      'pending',            -- placed, waiting for the shops to accept
      'confirmed',          -- every shop accepted, waiting for a rider
      'preparing',          -- a kitchen is cooking
      'out_for_delivery',   -- the rider has food in hand
      'delivered',          -- handed over, proof and cash recorded
      'cancelled'           -- every shop dropped the order
    );
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- The trip
-- --------------------------------------------------------------------------

create table if not exists public.deliveries (
  id text primary key
    default ('dlv_' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  reference text not null unique,
  customer_user_id uuid not null references auth.users (id) on delete cascade,
  customer text not null,
  customer_phone text not null,
  delivery_address text not null,
  delivery_barangay text,
  -- The city the shops are in; riders are offered trips in their own city.
  city text,
  payment payment_method not null,
  status public.delivery_status not null default 'pending',
  -- How many shops are still in the trip. Drops when a shop rejects.
  shops int not null default 1,
  subtotal numeric not null default 0,
  -- The service_areas rate alone, frozen at placement. The extra-shop
  -- surcharge is added on top of it, so a rejection can take the surcharge
  -- away without touching the rate the customer was quoted.
  base_delivery_fee numeric not null default 0,
  delivery_fee numeric not null default 0,
  service_fee numeric not null default 0,
  total numeric not null default 0,
  fee_agreed_in_person boolean not null default false,
  rider_id text references public.riders (id) on delete set null,
  rider text,
  -- The trip's payout, the sum of the stops' frozen fees. Informational:
  -- the ledger rows in rider_payouts are what is actually paid.
  rider_payout numeric,
  delivery_photo_path text,
  cash_collected numeric,
  gcash_reference text,
  delivery_failed_reason text,
  delivery_failed_at timestamptz,
  -- The slowest kitchen's prep time, for the customer's estimate.
  prep_minutes int,
  client_request_id text,
  placed_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.deliveries is
  'One trip: the customer, the address, the fees and the rider, for a basket that may hold food from several shops (0090). Each shop''s food is an order row linked by orders.delivery_id.';

create unique index if not exists deliveries_client_request_idx
  on public.deliveries (customer_user_id, client_request_id)
  where client_request_id is not null;

create index if not exists deliveries_customer_placed_idx
  on public.deliveries (customer_user_id, placed_at desc);

create index if not exists deliveries_rider_idx
  on public.deliveries (rider_id, placed_at desc)
  where rider_id is not null;

-- --------------------------------------------------------------------------
-- The link from a shop's part to its trip
-- --------------------------------------------------------------------------

alter table public.orders
  add column if not exists delivery_id text references public.deliveries (id) on delete set null;

create index if not exists orders_delivery_idx
  on public.orders (delivery_id)
  where delivery_id is not null;

comment on column public.orders.delivery_id is
  'The trip this order belongs to (0090). Null for orders placed before multi-shop checkouts, which keep the old single-shop flow.';

-- --------------------------------------------------------------------------
-- Offers: one per rider, for the whole trip
-- --------------------------------------------------------------------------

create table if not exists public.delivery_offers (
  id bigint generated always as identity primary key,
  delivery_id text not null references public.deliveries (id) on delete cascade,
  rider_id text not null references public.riders (id) on delete cascade,
  status public.offer_status not null default 'offered',
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  decline_reason text
);

comment on table public.delivery_offers is
  'Rider offers for a whole trip (0090). One offer per rider per trip, never one per shop.';

create unique index if not exists delivery_offers_open_idx
  on public.delivery_offers (delivery_id, rider_id)
  where status = 'offered';

create index if not exists delivery_offers_rider_idx
  on public.delivery_offers (rider_id, status);

-- --------------------------------------------------------------------------
-- The trip's cash, collected once
-- --------------------------------------------------------------------------

create table if not exists public.delivery_cash_collections (
  id bigint generated always as identity primary key,
  delivery_id text not null references public.deliveries (id) on delete cascade,
  rider_id text not null references public.riders (id) on delete cascade,
  amount_expected numeric not null,
  amount_collected numeric not null,
  variance numeric not null,
  collected_at timestamptz not null default now()
);

comment on table public.delivery_cash_collections is
  'Cash collected for a whole trip, against the trip''s grand total (0090). One row per trip: the customer pays one bill.';

create unique index if not exists delivery_cash_collections_delivery_idx
  on public.delivery_cash_collections (delivery_id);

-- The ledger rows belong to a trip as well, so the payout screens can group
-- the stops of one trip together.
alter table public.rider_payouts
  add column if not exists delivery_id text references public.deliveries (id) on delete set null;

create index if not exists rider_payouts_delivery_idx
  on public.rider_payouts (delivery_id)
  where delivery_id is not null;

-- --------------------------------------------------------------------------
-- Fees and pricing helpers
-- --------------------------------------------------------------------------

-- The charge for every shop after the first. The rider makes another stop.
create or replace function public.extra_shop_fee()
returns numeric
language sql
stable
as $$
  select 10.00::numeric;
$$;

comment on function public.extra_shop_fee() is
  'The charge for each extra shop in one trip, on top of the barangay''s delivery rate (0090).';

-- The trip's fees: the barangay rate plus a surcharge per extra shop, and one
-- service fee for the whole checkout.
--
-- base_rate is the RAW rate from order_fees: NULL when the barangay has no
-- band, or when it is agreed at the door. The caller needs to tell those two
-- apart -- "no rate" is refused, "agreed at the door" is not -- so the NULL is
-- not papered over here. delivery_fee is what the customer is charged: the
-- rate (or nothing, when it is settled at the door) plus the surcharge.
create or replace function public.delivery_fees(p_barangay text, p_shops int)
returns table (
  base_rate numeric,
  delivery_fee numeric,
  service_fee numeric,
  fee_agreed_in_person boolean
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_base numeric;
  v_service numeric;
  v_agreed boolean;
  v_shops int := greatest(coalesce(p_shops, 1), 1);
begin
  select f.delivery_fee, f.service_fee, f.fee_agreed_in_person
    into v_base, v_service, v_agreed
    from public.order_fees(p_barangay) f;

  return query
    select v_base,
           coalesce(v_base, 0) + public.extra_shop_fee() * (v_shops - 1),
           coalesce(v_service, 0),
           coalesce(v_agreed, false);
end;
$$;

comment on function public.delivery_fees(text, int) is
  'Fees for a trip: the barangay''s rate plus 10.00 per extra shop, and one service fee for the whole checkout (0090). base_rate is NULL when the barangay has no rate or is agreed at the door.';

-- One shop's basket, priced from menu_items. The client never sends a price.
create or replace function public.price_shop(
  p_restaurant_id text,
  p_items jsonb
)
returns table (
  restaurant_id text,
  restaurant_name text,
  is_open boolean,
  prep_minutes int,
  subtotal numeric,
  items jsonb
)
language plpgsql
stable
security invoker
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
begin
  if p_restaurant_id is null or btrim(p_restaurant_id) = '' then
    raise exception 'Choose a restaurant.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from restaurants r
     where r.id = p_restaurant_id
       and r.status = 'active'
       and r.archived_at is null
  ) then
    raise exception 'That restaurant is not available right now.' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.';
  end if;

  -- The same per-order cap as 0081: thirty different items in one basket.
  if jsonb_array_length(p_items) > c_max_lines then
    raise exception 'That is too many different items for one order.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_menu_id := v_item.value ->> 'menu_item_id';
    v_qty := coalesce((v_item.value ->> 'quantity')::int, 0);

    if v_menu_id is null or v_qty <= 0 then
      raise exception 'Quantities must be at least 1.' using errcode = '22023';
    end if;

    if v_qty > c_max_quantity then
      raise exception 'You can order at most % of one item.', c_max_quantity using errcode = '22023';
    end if;

    -- The item has to belong to THIS shop and still be on sale.
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

  return query
    select p_restaurant_id,
           r.name,
           r.is_open,
           r.prep_minutes,
           v_subtotal,
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
           )
      from restaurants r
     where r.id = p_restaurant_id;
end;
$$;

comment on function public.price_shop(text, jsonb) is
  'Price one shop''s basket from menu_items, with the 0081 caps (50 of a line, 30 lines). Prices are never taken from the client (0090).';

-- --------------------------------------------------------------------------
-- Quote a whole trip
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

  for v_entry in select * from jsonb_array_elements(p_shops) loop
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
  'Server-authoritative price preview for a basket that may hold food from several shops, priced for the destination barangay. The delivery fee is the barangay''s rate plus 10.00 per extra shop; the service fee is charged once (0090).';

revoke all on function public.quote_delivery(jsonb, text) from public;
grant execute on function public.quote_delivery(jsonb, text) to anon, authenticated;

-- --------------------------------------------------------------------------
-- Place a whole trip
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

  -- Price every shop first. Nothing is written until the whole basket prices
  -- cleanly, so a bad line cannot leave half a trip behind.
  for v_entry in select * from jsonb_array_elements(p_shops) loop
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
      where r.id in (select (e.value ->> 'restaurant_id') from jsonb_array_elements(p_shops) e)),
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
      where r.id in (select (e.value ->> 'restaurant_id') from jsonb_array_elements(p_shops) e))
  returning id into v_delivery_id;

  -- One order per shop. The shop's row carries its own food subtotal and
  -- nothing else: the fees live on the trip, so a merchant's sales never
  -- include the delivery fee or another shop's food.
  for v_entry in select * from jsonb_array_elements(p_shops) loop
    select s.* into v_priced
      from public.price_shop(
        v_entry.value ->> 'restaurant_id',
        v_entry.value -> 'items'
      ) s;

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
      v_priced.restaurant_name,
      v_priced.restaurant_id,
      v_priced.items,
      v_priced.subtotal,
      -- The fees belong to the trip. A shop's order total is its own food.
      0,
      0,
      v_priced.subtotal,
      'pending'::public.order_status,
      p_payment,
      now(),
      null,
      auth.uid(),
      v_address,
      v_barangay,
      v_customer_phone,
      null,
      v_priced.prep_minutes,
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
  'Price a basket that may hold food from up to ten shops and create one trip with one order per shop (0090). Customers only, not blocked or archived. Cash or e_wallet only, address and profile phone required. The delivery fee is the barangay''s rate plus 10.00 per extra shop and the service fee is charged once. p_client_request_id makes retries idempotent. Totals are never accepted from the client.';

revoke all on function public.customer_place_delivery(jsonb, text, payment_method, text, text) from public;
revoke all on function public.customer_place_delivery(jsonb, text, payment_method, text, text) from anon;
grant execute on function public.customer_place_delivery(jsonb, text, payment_method, text, text) to authenticated;

-- --------------------------------------------------------------------------
-- Dispatch: the trip
-- --------------------------------------------------------------------------

create or replace function public.offer_delivery_to_riders(p_delivery_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city text;
  v_count integer;
begin
  if not exists (
    select 1 from public.deliveries d
     where d.id = p_delivery_id
       and d.rider_id is null
       and d.status in ('confirmed', 'preparing')
  ) then
    return 0;
  end if;

  select d.city into v_city from public.deliveries d where d.id = p_delivery_id;

  if v_city is null then
    return 0;
  end if;

  insert into public.delivery_offers (delivery_id, rider_id, status, expires_at)
  select p_delivery_id, r.id, 'offered', now() + interval '5 minutes'
    from public.riders r
   where r.city = v_city
     and r.status = 'online'
     and r.archived_at is null
     and r.suspended_at is null
     -- One trip at a time: a rider already carrying a trip is skipped.
     and not exists (
       select 1 from public.deliveries c
        where c.rider_id = r.id
          and c.status in ('confirmed', 'preparing', 'out_for_delivery')
     )
     -- Declines stick.
     and not exists (
       select 1 from public.delivery_offers f
        where f.delivery_id = p_delivery_id
          and f.rider_id = r.id
          and f.status = 'declined'
     )
  on conflict (delivery_id, rider_id) where status = 'offered'
  do update set expires_at = excluded.expires_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.offer_delivery_to_riders(text) is
  'Offer a trip to every eligible rider in its city for 5 minutes, once every shop in it has accepted (0090).';

revoke all on function public.offer_delivery_to_riders(text) from public, anon, authenticated;

-- The trip's stops, as the rider and the customer need to see them. A shop
-- that rejected stays in the list with its own status: the customer is owed
-- an honest account of the trip, and the rider must not collect its food.
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
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.reference, o.restaurant, o.restaurant_id, o.items, o.subtotal, o.status
    from public.orders o
   where o.delivery_id = p_delivery_id
   order by o.placed_at, o.reference;
$$;

comment on function public.delivery_stops(text) is
  'The shops of a trip, in the order they were placed, for the rider''s trip screen and the customer''s tracking (0090). A shop that rejected is still listed, with its own status.';

revoke all on function public.delivery_stops(text) from public, anon, authenticated;

-- Offer a trip to a rider.
create or replace function public.fetch_rider_delivery_offers()
returns table (
  offer_id bigint,
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
  payout_per_stop numeric,
  city text,
  offered_at timestamp with time zone,
  expires_at timestamp with time zone
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id,
    d.id,
    d.reference,
    d.customer,
    d.delivery_address,
    d.customer_phone,
    d.shops,
    d.subtotal,
    d.delivery_fee,
    d.service_fee,
    d.total,
    public.rider_payout_per_delivery(),
    d.city,
    f.offered_at,
    f.expires_at
  from public.delivery_offers f
  join public.deliveries d on d.id = f.delivery_id
  where f.rider_id = public.current_rider_id()
    and f.status = 'offered'
    and f.expires_at > now()
  order by f.offered_at desc;
$$;

comment on function public.fetch_rider_delivery_offers() is
  'The trips offered to the signed-in rider (0090). One row per trip, not per shop.';

revoke all on function public.fetch_rider_delivery_offers() from public, anon, authenticated;
grant execute on function public.fetch_rider_delivery_offers() to authenticated;

-- Claim the whole trip.
create or replace function public.claim_delivery(p_delivery_id text)
returns table (
  delivery_id text,
  reference text,
  customer text,
  delivery_address text,
  customer_phone text,
  shops int,
  total numeric,
  rider_payout numeric,
  status public.delivery_status,
  stops jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider_id text;
  v_rider_name text;
  v_payout numeric;
  v_row public.deliveries;
begin
  select r.id, r.name into v_rider_id, v_rider_name
    from public.riders r
   where r.user_id = auth.uid()
     and r.archived_at is null
     and r.suspended_at is null;

  if v_rider_id is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.delivery_offers f
     where f.delivery_id = p_delivery_id
       and f.rider_id = v_rider_id
       and f.status = 'offered'
       and f.expires_at > now()
  ) then
    raise exception 'That delivery is no longer available.' using errcode = 'P0001';
  end if;

  v_payout := public.rider_payout_per_delivery();

  -- The trip is taken as a whole. The parts follow the rider so every screen
  -- that already reads an assigned order keeps working, and the payout is
  -- frozen per stop: a stop is what the rider is paid for.
  update public.orders o
     set rider_id = v_rider_id,
         rider = v_rider_name,
         rider_payout = v_payout
   where o.delivery_id = p_delivery_id
     and o.rider_id is null
     and o.status in ('confirmed', 'preparing');

  update public.deliveries d
     set rider_id = v_rider_id,
         rider = v_rider_name,
         rider_payout = v_payout * (select count(*) from public.orders o
                                     where o.delivery_id = d.id
                                       and o.status <> 'cancelled'),
         updated_at = now()
   where d.id = p_delivery_id
     and d.rider_id is null;

  update public.delivery_offers
     set status = 'claimed', claimed_at = now()
   where delivery_offers.delivery_id = p_delivery_id
     and delivery_offers.rider_id = v_rider_id
     and delivery_offers.status = 'offered';

  -- Everyone else's live offer for this trip is now moot.
  update public.delivery_offers
     set status = 'expired'
   where delivery_offers.delivery_id = p_delivery_id
     and delivery_offers.status = 'offered'
     and delivery_offers.rider_id <> v_rider_id;

  select * into v_row from public.deliveries d where d.id = p_delivery_id;

  return query
    select v_row.id, v_row.reference, v_row.customer, v_row.delivery_address,
           v_row.customer_phone, v_row.shops, v_row.total, v_row.rider_payout,
           v_row.status,
           (select coalesce(jsonb_agg(to_jsonb(s) order by s.reference), '[]'::jsonb)
              from public.delivery_stops(v_row.id) s);
end;
$$;

comment on function public.claim_delivery(text) is
  'Claim a whole trip (0090). One rider takes every shop in it; the payout is frozen per stop and the trip''s stops come back with it.';

revoke all on function public.claim_delivery(text) from public, anon, authenticated;
grant execute on function public.claim_delivery(text) to authenticated;

-- Turn a trip down.
create or replace function public.decline_delivery(p_delivery_id text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider_id text;
begin
  v_rider_id := public.current_rider_id();
  if v_rider_id is null then
    raise exception 'Your account is not linked to a rider.' using errcode = '42501';
  end if;

  update public.delivery_offers
     set status = 'declined',
         decline_reason = nullif(btrim(p_reason), '')
   where delivery_id = p_delivery_id
     and rider_id = v_rider_id
     and status = 'offered';

  if not found then
    raise exception 'That delivery is no longer available.' using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.decline_delivery(text, text) is
  'Turn a trip down (0090). A decline sticks: the rider is not asked again for that trip.';

revoke all on function public.decline_delivery(text, text) from public, anon, authenticated;
grant execute on function public.decline_delivery(text, text) to authenticated;

-- The admin sends a trip to named riders, or to the whole city.
create or replace function public.admin_dispatch_delivery(
  p_delivery_id text,
  p_rider_ids text[] default null
)
returns table (delivery_id text, offered_to integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city text;
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  select d.city into v_city
    from public.deliveries d
   where d.id = p_delivery_id
     and d.rider_id is null
     and d.status in ('confirmed', 'preparing');

  if v_city is null then
    raise exception 'That trip is not available for dispatch. It may already have a rider, or a shop has not accepted yet.'
      using errcode = '22023';
  end if;

  insert into public.delivery_offers (delivery_id, rider_id, status, expires_at)
  select p_delivery_id, r.id, 'offered', now() + interval '5 minutes'
    from public.riders r
   where (
         (p_rider_ids is null and r.city = v_city)
         or (p_rider_ids is not null and r.id = any (p_rider_ids))
       )
     and r.status = 'online'
     and r.archived_at is null
     and r.suspended_at is null
     and not exists (
       select 1 from public.delivery_offers f
        where f.delivery_id = p_delivery_id
          and f.rider_id = r.id
          and f.status = 'declined'
     )
  on conflict (delivery_id, rider_id) where status = 'offered'
  do update set expires_at = excluded.expires_at;

  get diagnostics v_count = row_count;

  delivery_id := p_delivery_id;
  offered_to := v_count;
  return next;
end;
$$;

comment on function public.admin_dispatch_delivery(text, text[]) is
  'Offer a trip to named riders, or to every online rider in its city (0090).';

revoke all on function public.admin_dispatch_delivery(text, text[]) from public, anon, authenticated;
grant execute on function public.admin_dispatch_delivery(text, text[]) to authenticated;

-- --------------------------------------------------------------------------
-- The rider's trips
-- --------------------------------------------------------------------------

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
  placed_at timestamp with time zone
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.reference, d.customer, d.delivery_address, d.customer_phone,
         d.shops, d.subtotal, d.delivery_fee, d.service_fee, d.total,
         d.status, d.placed_at
    from public.deliveries d
   where d.rider_id = public.current_rider_id()
     and (p_cursor is null or d.placed_at < p_cursor)
   order by d.placed_at desc
   limit greatest(coalesce(p_limit, 20), 1);
$$;

comment on function public.rider_my_deliveries(timestamp with time zone, integer) is
  'The trips assigned to the signed-in rider, newest first (0090).';

revoke all on function public.rider_my_deliveries(timestamp with time zone, integer) from public, anon, authenticated;
grant execute on function public.rider_my_deliveries(timestamp with time zone, integer) to authenticated;

-- --------------------------------------------------------------------------
-- Completing the trip: proof, cash, payout
-- --------------------------------------------------------------------------

create or replace function public.refresh_rider_totals(p_rider_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- RECOMPUTE, do not increment: a later deletion must not leave the
  -- denormalised copy permanently wrong. Deliveries counts TRIPS, so the
  -- stops of one multi-shop trip count once (0090).
  update public.riders r
     set deliveries = (select count(distinct coalesce(p.delivery_id, p.order_id))::int
                         from public.rider_payouts p where p.rider_id = p_rider_id),
         earnings = coalesce((select sum(p.amount)
                                from public.rider_payouts p where p.rider_id = p_rider_id), 0)
   where r.id = p_rider_id;
end;
$$;

comment on function public.refresh_rider_totals(text) is
  'Recompute a rider''s delivery count and earnings from the payout ledger. A trip counts once, however many stops it had (0090).';

revoke all on function public.refresh_rider_totals(text) from public, anon, authenticated;

create or replace function public.rider_mark_delivery_delivered(
  p_delivery_id text,
  p_proof_path text,
  p_cash_collected numeric default null,
  p_gcash_reference text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider_id text;
  v_row public.deliveries;
  v_proof text := nullif(btrim(coalesce(p_proof_path, '')), '');
  v_gcash text := nullif(btrim(coalesce(p_gcash_reference, '')), '');
  v_cash numeric;
  v_variance numeric;
  v_stop record;
begin
  select r.id into v_rider_id
    from public.riders r
   where r.user_id = auth.uid()
     and r.archived_at is null
     and r.suspended_at is null;

  if v_rider_id is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;

  select * into v_row
    from public.deliveries d
   where d.id = p_delivery_id;

  if v_row.id is null then
    raise exception 'No trip with id %.', p_delivery_id;
  end if;

  if v_row.rider_id is distinct from v_rider_id then
    raise exception 'That trip is not assigned to you.' using errcode = '42501';
  end if;

  if v_row.status not in ('out_for_delivery', 'confirmed', 'preparing') then
    raise exception 'That trip cannot be marked delivered from its current state (%).', v_row.status;
  end if;

  -- Proof is the point of the trip, so it is required. The photo is uploaded
  -- by the client first and the object must exist: without that check a rider
  -- could name any path and close a trip with a file that is not there.
  if v_proof is null then
    raise exception 'Take a photo of the delivery before completing it.'
      using errcode = '22023';
  end if;

  -- The path must be THIS rider's photo of THIS trip.
  if v_proof not in (
    v_rider_id || '/' || p_delivery_id || '.jpg',
    v_rider_id || '/' || p_delivery_id || '.png',
    v_rider_id || '/' || p_delivery_id || '.webp'
  ) then
    raise exception 'That delivery photo does not belong to this trip. Take it again.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'delivery-proofs'
       and o.name = v_proof
  ) then
    raise exception 'That delivery photo was not found. Upload it again.'
      using errcode = 'P0001';
  end if;

  -- Cash is stated on a cash trip, and it is checked against the TRIP's
  -- total: the customer pays one bill.
  v_cash := round(coalesce(p_cash_collected, 0), 2);

  if v_row.payment = 'cash' and p_cash_collected is null then
    raise exception 'Enter the cash you collected.' using errcode = '22023';
  end if;

  if v_cash < 0 then
    raise exception 'Cash collected cannot be negative.' using errcode = '22023';
  end if;

  -- The trip first, then its shops. Doing it in this order means the trip is
  -- already closed when the shops follow it out, and the trigger that keeps a
  -- trip in step with its shops cannot reopen it.
  update public.deliveries d
     set status = 'delivered',
         delivered_at = now(),
         delivery_photo_path = v_proof,
         cash_collected = v_cash,
         gcash_reference = v_gcash,
         updated_at = now()
   where d.id = p_delivery_id
     and d.status = any (array['out_for_delivery', 'confirmed', 'preparing']::public.delivery_status[]);

  if not found then
    raise exception 'That trip is no longer yours to complete.' using errcode = 'P0001';
  end if;

  -- Every shop's part is delivered with the trip. The shops keep their own
  -- order rows, and their status follows the trip.
  update public.orders o
     set status = 'delivered',
         delivered_at = now(),
         delivery_photo_path = v_proof
   where o.delivery_id = p_delivery_id
     and o.status = any (array['out_for_delivery', 'confirmed', 'preparing']::public.order_status[]);

  -- Payout: one ledger row per stop, all pointing at the trip.
  for v_stop in
    select o.id, o.rider_payout
      from public.orders o
     where o.delivery_id = p_delivery_id
       and o.rider_id = v_rider_id
       and o.status = 'delivered'
  loop
    if v_stop.rider_payout is null then
      raise exception 'This trip has no agreed fee recorded. Ask an admin to fix it.'
        using errcode = 'P0001';
    end if;

    insert into public.rider_payouts (
      rider_id, order_id, amount, delivery_id, gcash_reference, gcash_reference_missing
    )
    values (
      v_rider_id, v_stop.id, v_stop.rider_payout, p_delivery_id,
      v_gcash,
      (v_row.payment = 'e_wallet' and v_gcash is null)
    )
    on conflict (order_id) do nothing;
  end loop;

  -- The other direction of the same money: one collection for the trip.
  if v_row.payment = 'cash' then
    v_variance := round(v_cash - v_row.total, 2);
    -- Fee agreed at the door (0080): cash above the total IS that fee.
    if v_row.fee_agreed_in_person then
      v_variance := least(v_variance, 0);
    end if;

    insert into public.delivery_cash_collections (
      delivery_id, rider_id, amount_expected, amount_collected, variance
    )
    values (
      p_delivery_id, v_rider_id, round(v_row.total, 2), v_cash, v_variance
    )
    on conflict (delivery_id) do nothing;
  end if;

  perform public.refresh_rider_totals(v_rider_id);
end;
$$;

comment on function public.rider_mark_delivery_delivered(text, text, numeric, text) is
  'Complete a whole trip (0090): the photo proof, the cash collected against the trip''s grand total, the GCash reference, and one payout row per stop.';

revoke all on function public.rider_mark_delivery_delivered(text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.rider_mark_delivery_delivered(text, text, numeric, text) to authenticated;

-- A rider cannot deliver a trip: the whole trip goes back to the shops and
-- is offered again, to a different rider.
create or replace function public.rider_report_failed_delivery_trip(
  p_delivery_id text,
  p_reason text
)
returns table (delivery_id text, reference text, status public.delivery_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider_id text;
  v_row public.deliveries;
begin
  select r.id into v_rider_id
    from public.riders r
   where r.user_id = auth.uid()
     and r.archived_at is null
     and r.suspended_at is null;

  if v_rider_id is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;

  select * into v_row from public.deliveries d where d.id = p_delivery_id;

  if v_row.id is null then
    raise exception 'No trip with id %.', p_delivery_id;
  end if;

  if v_row.rider_id is distinct from v_rider_id then
    raise exception 'That trip is not assigned to you.' using errcode = '42501';
  end if;

  if v_row.status not in ('out_for_delivery', 'confirmed', 'preparing') then
    raise exception 'That trip cannot be failed from its current state (%).', v_row.status;
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Say why the delivery could not be completed.' using errcode = '22023';
  end if;

  update public.deliveries d
     set rider_id = null,
         rider = null,
         rider_payout = null,
         status = 'confirmed',
         delivery_failed_reason = left(btrim(p_reason), 500),
         delivery_failed_at = now(),
         updated_at = now()
   where d.id = p_delivery_id;

  -- The shops go back with the trip: their parts are still the customer's
  -- order and still need a rider.
  update public.orders o
     set rider_id = null,
         rider = null,
         rider_payout = null,
         status = 'confirmed',
         delivery_failed_reason = left(btrim(p_reason), 500),
         delivery_failed_at = now(),
         delivery_failed_by = v_rider_id
   where o.delivery_id = p_delivery_id
     and o.status in ('out_for_delivery', 'confirmed', 'preparing');

  -- A fresh set of offers, skipping the rider who just gave up.
  update public.delivery_offers
     set status = 'expired'
   where delivery_offers.delivery_id = p_delivery_id
     and delivery_offers.status = 'offered';

  perform public.offer_delivery_to_riders(p_delivery_id);

  return query
    select v_row.id, v_row.reference, 'confirmed'::public.delivery_status;
end;
$$;

comment on function public.rider_report_failed_delivery_trip(text, text) is
  'Give a whole trip back (0090). The trip and its shops go back to confirmed with no rider, and it is offered again.';

revoke all on function public.rider_report_failed_delivery_trip(text, text) from public, anon, authenticated;
grant execute on function public.rider_report_failed_delivery_trip(text, text) to authenticated;

-- --------------------------------------------------------------------------
-- The trip follows its shops
-- --------------------------------------------------------------------------

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

  -- The last shop that was still deciding has now accepted: the trip goes to
  -- the riders. One set of offers for the whole trip, not one per shop.
  if not v_any_pending and old.status = 'pending' then
    perform public.offer_delivery_to_riders(v_delivery_id);
  end if;

  return null;
end;
$$;

comment on function public.deliveries_sync_from_parts() is
  'Keeps a trip in step with its shops: the status, the shop count, and the re-priced total after a shop rejects (0090).';

revoke all on function public.deliveries_sync_from_parts() from public, anon, authenticated;

drop trigger if exists deliveries_sync_from_parts on public.orders;
create trigger deliveries_sync_from_parts
  after update of status on public.orders
  for each row
  when (new.delivery_id is not null)
  execute function public.deliveries_sync_from_parts();

-- --------------------------------------------------------------------------
-- Rebuilt from the live definitions, with the multi-shop rules added
-- --------------------------------------------------------------------------

-- Live body, unchanged except for one line: an order that belongs to a trip
-- is dispatched as part of the trip, not on its own.
create or replace function public.orders_auto_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed'
     and old.status is distinct from 'confirmed'
     and new.rider_id is null
     -- A part of a trip is offered with the trip (0090), not on its own.
     and new.delivery_id is null then
    perform public.offer_order_to_riders(new.id);
  end if;
  return null;
end;
$$;

revoke all on function public.orders_auto_dispatch() from public, anon, authenticated;

-- Has the rider already collected food for this trip? Read through a definer,
-- because the guard below runs with the CLIENT's privileges: a merchant has
-- no policy on `deliveries` and cannot see another shop's part, so a direct
-- read there would find nothing and the guard would never fire.
create or replace function public.delivery_food_collected(p_delivery_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.deliveries d
       where d.id = p_delivery_id
         and d.status = 'out_for_delivery'
    )
    or exists (
      select 1 from public.orders o
       where o.delivery_id = p_delivery_id
         and o.status = 'out_for_delivery'
    );
$$;

comment on function public.delivery_food_collected(text) is
  'Has the rider collected food for this trip yet? Read with definer rights, so the client-side guard can ask without seeing another shop''s rows (0090).';

revoke all on function public.delivery_food_collected(text) from public, anon;
grant execute on function public.delivery_food_collected(text) to authenticated;

-- Live body, plus one guard: a shop cannot drop its part once the rider has
-- collected food for the trip. By then the money is a refund, not a re-price.
create or replace function public.orders_guard_client_status()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') or public.is_platform_admin() then
    return new;
  end if;

  if new.status is distinct from old.status
     and (old.status, new.status) not in (
       ('pending'::order_status, 'confirmed'::order_status),
       ('pending', 'cancelled'),
       ('confirmed', 'preparing'),
       ('confirmed', 'cancelled'),
       ('preparing', 'cancelled')
     ) then
    raise exception 'An order cannot move from % to % here.', old.status, new.status
      using errcode = '42501';
  end if;

  -- A trip whose food is already with the rider cannot lose a shop: the
  -- customer has to be refunded, and that is the refund flow, not a re-price
  -- (0090).
  if new.status = 'cancelled'
     and old.status is distinct from 'cancelled'
     and new.delivery_id is not null
     and public.delivery_food_collected(new.delivery_id) then
    raise exception 'This order is already on its way and cannot be cancelled here.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.orders_guard_client_status() is
  'Limits a direct (non-admin) client update of orders to the merchant transitions: confirm, prepare, cancel (0083), and refuses to cancel a part of a trip that is already out for delivery (0090).';

drop trigger if exists orders_guard_client_status on public.orders;
create trigger orders_guard_client_status
  before update on public.orders
  for each row execute function public.orders_guard_client_status();

-- Live body, plus a fix for a bug that made this function unusable.
--
-- rider_mark_picked_up returns a column called `status`, and the UPDATE's
-- WHERE clause also says `status = any (...)`. PL/pgSQL cannot tell the OUT
-- parameter from the column, so every call raised
--   ERROR: column reference "status" is ambiguous
-- at run time -- the rider's "picked up" button could not work. The codebase
-- already knows this trap: rate_order carries `#variable_conflict use_column`
-- for exactly this reason. Nothing else in the body changes.
create or replace function public.rider_mark_picked_up(p_order_id text)
 RETURNS TABLE(order_id text, reference text, status order_status)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_rider_id text;
  v_status order_status;
  v_order_rider_id text;
begin
  select r.id into v_rider_id
    from riders r
   where r.user_id = auth.uid()
     and r.archived_at is null
     and r.suspended_at is null;

  if v_rider_id is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;

  select o.status, o.rider_id into v_status, v_order_rider_id
    from orders o
   where o.id = p_order_id;

  if v_status is null then
    raise exception 'No order with id %.', p_order_id;
  end if;

  if v_order_rider_id is distinct from v_rider_id then
    raise exception 'That order is not assigned to you.' using errcode = '42501';
  end if;

  -- Already on the way is not an error worth a second round trip; the rider
  -- tapping twice is told the order is out for delivery and nothing changes.
  if v_status = 'out_for_delivery' then
    return query
      select o.id, o.reference, o.status from orders o where o.id = p_order_id;
    return;
  end if;

  if v_status not in ('confirmed', 'preparing') then
    raise exception 'That order cannot be picked up from its current state (%).', v_status;
  end if;

  update orders
     set status = 'out_for_delivery'
   where id = p_order_id
     -- Same cast as above; enum compared against a text[] otherwise.
     and status = any (array['confirmed', 'preparing']::order_status[]);

  if not found then
    raise exception 'That order is no longer yours to run.' using errcode = 'P0001';
  end if;

  return query
    select o.id, o.reference, o.status from orders o where o.id = p_order_id;
end;
$function$;

-- Live body, with two changes: an order that belongs to a trip is completed
-- through the trip (one photo, one cash, one set of payouts), and the
-- rider's totals are recomputed by the shared helper, so a trip counts once.
create or replace function public.rider_mark_delivered(p_order_id text, p_proof_path text, p_cash_collected numeric DEFAULT NULL::numeric, p_gcash_reference text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rider_id text;
  v_order_rider_id text;
  v_status order_status;
  v_payout numeric;
  v_total numeric;
  v_payment payment_method;
  v_fee_agreed boolean;
  v_variance numeric;
  v_proof text := nullif(btrim(coalesce(p_proof_path, '')), '');
  v_gcash text := nullif(btrim(coalesce(p_gcash_reference, '')), '');
  v_cash numeric;
  v_delivery_id text;
begin
  -- Guard added: 0038 resolved the rider with no archived/suspended check, so a
  -- rider suspended while holding an order could still complete it and be paid.
  select r.id into v_rider_id
    from riders r
   where r.user_id = auth.uid()
     and r.archived_at is null
     and r.suspended_at is null;

  if v_rider_id is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;

  -- Read the order's assignee into its OWN variable. 0038 fixed this: it used to
  -- select into v_rider_id, overwriting the caller's id with the order's, so the
  -- ownership check compared the order's rider against itself and could never
  -- fail. Do not reintroduce it.
  select o.status, o.rider_id, o.rider_payout, o.total, o.payment, o.fee_agreed_in_person, o.delivery_id
    into v_status, v_order_rider_id, v_payout, v_total, v_payment, v_fee_agreed, v_delivery_id
    from orders o
   where o.id = p_order_id;

  if v_status is null then
    raise exception 'No order with id %.', p_order_id;
  end if;

  if v_order_rider_id is distinct from v_rider_id then
    raise exception 'That order is not assigned to you.' using errcode = '42501';
  end if;

  -- A part of a trip is delivered with the trip: one photo, one cash
  -- collection, one set of payouts (0090).
  if v_delivery_id is not null then
    raise exception 'This order is part of a delivery. Complete the delivery instead.'
      using errcode = '22023';
  end if;

  if v_status not in ('out_for_delivery', 'confirmed', 'preparing') then
    raise exception 'That order cannot be marked delivered from its current state (%).', v_status;
  end if;

  -- 0079: proof is the point of this function, so it is required rather than
  -- merely recorded. The photo is uploaded by the client first and the object
  -- must already exist: without that check a rider could name any path and
  -- close a delivery with a file that is not there.
  if v_proof is null then
    raise exception 'Take a photo of the delivery before completing it.'
      using errcode = '22023';
  end if;

  -- The path must be THIS rider's photo of THIS order (the client writes
  -- <rider>/<order>.<ext>). Existence alone would accept any proof in the
  -- bucket, including another rider's or an older delivery's.
  if v_proof not in (
    v_rider_id || '/' || p_order_id || '.jpg',
    v_rider_id || '/' || p_order_id || '.png',
    v_rider_id || '/' || p_order_id || '.webp'
  ) then
    raise exception 'That delivery photo does not belong to this order. Take it again.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'delivery-proofs'
       and o.name = v_proof
  ) then
    raise exception 'That delivery photo was not found. Upload it again.'
      using errcode = 'P0001';
  end if;

  -- Cash must be stated on a cash order. The amount is the rider's assertion
  -- and may disagree with the total; that is recorded, not refused. Refusing to
  -- close would strand a delivery that has already physically happened.
  v_cash := round(coalesce(p_cash_collected, 0), 2);

  if v_payment = 'cash' and p_cash_collected is null then
    raise exception 'Enter the cash you collected.' using errcode = '22023';
  end if;

  if v_cash < 0 then
    raise exception 'Cash collected cannot be negative.' using errcode = '22023';
  end if;

  -- The status precondition lives in the UPDATE, not only in the IF above. Two
  -- concurrent taps both read 'confirmed', both passed the IF, and both ran the
  -- increments below. With the guard here the loser updates zero rows and is
  -- told why, instead of double-counting.
  update orders
     set status = 'delivered',
         delivered_at = now(),
         delivery_photo_path = v_proof
   where id = p_order_id
     -- Cast required. `array['a','b']` is text[], and orders.status is the
     -- order_status enum, so without this Postgres reports
     -- \"operator does not exist: order_status = text\" (42883) and the whole
     -- function raises -- for every delivery, not just an odd status.
     and status = any (array['out_for_delivery', 'confirmed', 'preparing']::order_status[]);

  if not found then
    raise exception 'That order is no longer yours to complete.' using errcode = 'P0001';
  end if;

  -- A NULL payout here means the claim predates the freeze being restored. It
  -- used to be silently recorded as a real 0.00 payout, which is unrecoverable
  -- because of unique (order_id). Refusing is better than a permanent zero: the
  -- rider is not paid a peso they earned, and the operator sees why.
  if v_payout is null then
    raise exception 'This delivery has no agreed fee recorded. Ask an admin to fix it.'
      using errcode = 'P0001';
  end if;

  -- The ledger row is the record. on conflict do nothing keeps a retry from
  -- raising instead of quietly double-paying.
  insert into rider_payouts (
    rider_id, order_id, amount,
    gcash_reference, gcash_reference_missing
  )
  values (
    v_rider_id, p_order_id, v_payout,
    v_gcash,
    (v_payment = 'e_wallet' and v_gcash is null)
  )
  on conflict (order_id) do nothing;

  -- The other direction of the same money. Only a cash order creates one: a
  -- GCash payment went from the customer to the rider's own account and the
  -- platform never held it, so there is nothing to hand back.
  if v_payment = 'cash' then
    v_variance := round(v_cash - v_total, 2);
    -- Fee agreed at the door (0080): cash above the total IS that fee. Only a
    -- shortfall against the food and service fee is a real variance.
    if v_fee_agreed then
      v_variance := least(v_variance, 0);
    end if;

    insert into rider_cash_collections (
      rider_id, order_id, amount_expected, amount_collected, variance
    )
    values (
      v_rider_id, p_order_id, round(v_total, 2), v_cash, v_variance
    )
    on conflict (order_id) do nothing;
  end if;

  -- RECOMPUTE, do not increment. riders.deliveries and riders.earnings are
  -- denormalised copies of the ledger; adding to them meant any later deletion
  -- (on delete cascade from orders) left them permanently wrong with nothing to
  -- reconcile. Recomputing is idempotent, so it is also immune to the double-tap
  -- race above. The shared helper counts a trip once (0090).
  perform public.refresh_rider_totals(v_rider_id);
end;
$function$;

-- Live body, with one change: a part of a trip cannot be failed on its own.
-- The trip goes back as a whole, or nothing goes back.
create or replace function public.rider_report_failed_delivery(p_order_id text, p_reason text)
 RETURNS TABLE(order_id text, reference text, status order_status)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rider_id text;
  v_status order_status;
  v_order_rider_id text;
  v_delivery_id text;
begin
  -- Guard added: 0044 checked archived_at but not suspended_at.
  select r.id into v_rider_id
    from riders r
   where r.user_id = auth.uid()
     and r.archived_at is null
     and r.suspended_at is null;

  if v_rider_id is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;

  select o.status, o.rider_id, o.delivery_id
    into v_status, v_order_rider_id, v_delivery_id
    from orders o
   where o.id = p_order_id;

  if v_status is null then
    raise exception 'No order with id %.', p_order_id;
  end if;

  if v_order_rider_id is distinct from v_rider_id then
    raise exception 'That order is not assigned to you.' using errcode = '42501';
  end if;

  -- A trip is failed as a whole (0090): the rider cannot deliver one shop of
  -- a basket they are carrying.
  if v_delivery_id is not null then
    raise exception 'This order is part of a delivery. Give the whole delivery back instead.'
      using errcode = '22023';
  end if;

  if v_status not in ('out_for_delivery', 'confirmed', 'preparing') then
    raise exception 'That order cannot be failed from its current state (%).', v_status;
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Say why the delivery could not be completed.' using errcode = '22023';
  end if;

  update orders
     set rider_id = null,
         rider = null,
         -- The fee belonged to the rider who failed it. Leaving it set would
         -- advertise a payout to whoever claims the order next.
         rider_payout = null,
         status = 'confirmed',
         -- Kept from 0044 verbatim. These three columns are the accountability
         -- record for a bounced delivery and they survive reassignment on
         -- purpose, so they must not be dropped in a rebuild.
         delivery_failed_reason = left(btrim(p_reason), 500),
         delivery_failed_at = now(),
         delivery_failed_by = v_rider_id
   where id = p_order_id;

  return query
    select o.id, o.reference, o.status
      from orders o
     where o.id = p_order_id;
end;
$function$;

-- Live body, plus the trip's rows: the rider's job list now carries the
-- delivery each order belongs to, so the app can show a trip once instead of
-- one card per shop. p_only_legacy keeps the old list for the orders that
-- were placed before multi-shop checkouts.
drop function if exists public.fetch_rider_orders_page(timestamp with time zone, integer);

create or replace function public.fetch_rider_orders_page(
  p_cursor timestamp with time zone default null,
  p_limit integer default 20,
  p_only_legacy boolean default false
)
 RETURNS TABLE(id text, reference text, customer text, customer_phone text, restaurant text, delivery_address text, items jsonb, total numeric, rider_payout numeric, status order_status, payment payment_method, placed_at timestamp with time zone, delivery_id text, next_cursor timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rider_id text;
begin
  -- Verify caller is a rider. Deliberately does NOT exclude archived riders:
  -- someone archived mid-delivery still has to finish the job in front of
  -- them. Claiming is gated on being live (0036); reading your own assigned
  -- work is not.
  select r.id into v_rider_id
    from riders r
   where r.user_id = auth.uid();

  if v_rider_id is null then
    raise exception 'Your account is not linked to a rider.'
      using errcode = '42501';
  end if;

  -- Return orders assigned to this rider, ordered by placed_at DESC
  -- Cursor is the placed_at of the last item in the previous page
  return query
    select
      o.id,
      o.reference,
      o.customer,
      o.customer_phone,
      o.restaurant,
      o.delivery_address,
      o.items,
      o.total,
      o.rider_payout,
      o.status,
      o.payment,
      o.placed_at,
      o.delivery_id,
      case when count(*) over () > p_limit then o.placed_at else null end as next_cursor
    from orders o
   where o.rider_id = v_rider_id
     and (p_cursor is null or o.placed_at < p_cursor)
     -- Legacy rows: the orders placed before multi-shop checkouts, which are
     -- not part of a trip and are listed on their own.
     and (not p_only_legacy or o.delivery_id is null)
   order by o.placed_at desc
   limit p_limit;
end;
$function$;

-- Live body, with the trip's cash added: a trip is one cash collection, and
-- the rider's on-hand money has to include it.
create or replace function public.rider_cash_position()
 RETURNS TABLE(collected numeric, handed_over numeric, on_hand numeric, flagged numeric, deliveries bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rider_id text;
begin
  select r.id into v_rider_id
    from riders r
   where r.user_id = auth.uid()
     and r.archived_at is null
     and r.suspended_at is null;

  if v_rider_id is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;

  return query
  select
    coalesce(c.total, 0),
    coalesce(h.total, 0),
    coalesce(c.total, 0) - coalesce(h.total, 0),
    coalesce(c.flagged, 0),
    coalesce(c.deliveries, 0)
  from (select 0::numeric as total, 0::numeric as flagged, 0::bigint as deliveries) z
  left join lateral (
    -- abs: a short collection is the dispute an operator most needs to see.
    -- sum() over bigint returns numeric, so the count is cast back: the
    -- function returns bigint.
    select sum(x.total) as total,
           sum(x.flagged) as flagged,
           sum(x.deliveries)::bigint as deliveries
      from (
        select sum(y.amount_collected) as total,
               sum(abs(y.variance)) as flagged,
               count(*)::bigint as deliveries
          from rider_cash_collections y
         where y.rider_id = v_rider_id
        union all
        select sum(w.amount_collected),
               sum(abs(w.variance)),
               count(*)::bigint
          from delivery_cash_collections w
         where w.rider_id = v_rider_id
      ) x
  ) c on true
  left join lateral (
    select sum(y.amount) as total
      from rider_cash_handovers y
     where y.rider_id = v_rider_id
  ) h on true;
end;
$function$;

-- Live body, with the trip's cash added, for the same reason as above.
create or replace function public.admin_rider_cash()
 RETURNS TABLE(rider_id text, rider_name text, collected numeric, handed_over numeric, on_hand numeric, flagged numeric, deliveries bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (
    select 1 from app_users
     where user_id = auth.uid() and role = 'admin'
  ) then
    raise exception 'This action is for administrators only.' using errcode = '42501';
  end if;

  return query
    select r.id,
         r.name,
         coalesce(c.total, 0),
         coalesce(h.total, 0),
         coalesce(c.total, 0) - coalesce(h.total, 0),
         coalesce(c.flagged, 0),
         coalesce(c.deliveries, 0)
    from riders r
    left join lateral (
      select sum(x.total) as total,
             sum(x.flagged) as flagged,
             sum(x.deliveries)::bigint as deliveries
        from (
          select sum(y.amount_collected) as total,
                 sum(abs(y.variance)) as flagged,
                 count(*)::bigint as deliveries
            from rider_cash_collections y
           where y.rider_id = r.id
          union all
          select sum(w.amount_collected),
                 sum(abs(w.variance)),
                 count(*)::bigint
            from delivery_cash_collections w
           where w.rider_id = r.id
        ) x
    ) c on true
    left join lateral (
      select sum(y.amount) as total
        from rider_cash_handovers y
       where y.rider_id = r.id
    ) h on true
   where r.archived_at is null
   order by r.name;
end;
$function$;

-- --------------------------------------------------------------------------
-- Tracking
-- --------------------------------------------------------------------------

create or replace function public.track_delivery(p_reference text)
returns table (
  reference text,
  customer text,
  delivery_address text,
  delivery_barangay text,
  payment payment_method,
  subtotal numeric,
  base_delivery_fee numeric,
  delivery_fee numeric,
  service_fee numeric,
  total numeric,
  status public.delivery_status,
  placed_at timestamp with time zone,
  rider text,
  stops jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.deliveries;
  v_ref text;
begin
  if p_reference is null or btrim(p_reference) = '' then
    return;
  end if;

  v_ref := upper(replace(btrim(p_reference), '#', ''));

  select * into v_row
    from public.deliveries d
   where upper(replace(d.reference, '#', '')) = v_ref
   limit 1;

  if not found then
    return;
  end if;

  return query
    select
      v_row.reference,
      v_row.customer,
      -- PII gate: the address is only for the trip's own customer.
      case
        when v_row.customer_user_id = auth.uid() then v_row.delivery_address
        else null
      end,
      v_row.delivery_barangay,
      v_row.payment,
      v_row.subtotal,
      v_row.base_delivery_fee,
      v_row.delivery_fee,
      v_row.service_fee,
      v_row.total,
      v_row.status,
      v_row.placed_at,
      v_row.rider,
      (select coalesce(jsonb_agg(to_jsonb(s) order by s.reference), '[]'::jsonb)
         from public.delivery_stops(v_row.id) s);
end;
$$;

comment on function public.track_delivery(text) is
  'Track a trip by its reference: every shop''s status and the rider, with the address only for the customer who ordered it (0090).';

revoke all on function public.track_delivery(text) from public;
grant execute on function public.track_delivery(text) to anon, authenticated;

-- --------------------------------------------------------------------------
-- Row level security
-- --------------------------------------------------------------------------

alter table public.deliveries enable row level security;

drop policy if exists "customers read own deliveries" on public.deliveries;
create policy "customers read own deliveries"
  on public.deliveries for select to authenticated
  using (customer_user_id = auth.uid());

drop policy if exists "riders read assigned deliveries" on public.deliveries;
create policy "riders read assigned deliveries"
  on public.deliveries for select to authenticated
  using (rider_id = (select riders.id from riders where riders.user_id = auth.uid() limit 1));

drop policy if exists "admins read all deliveries" on public.deliveries;
create policy "admins read all deliveries"
  on public.deliveries for select to authenticated
  using (public.is_platform_admin());

-- A merchant never reads the trip: it only ever sees its own part, with its
-- own food subtotal, in the orders table.
revoke all on table public.deliveries from anon, authenticated;
grant select on table public.deliveries to authenticated;

alter table public.delivery_offers enable row level security;
revoke all on table public.delivery_offers from anon, authenticated;

alter table public.delivery_cash_collections enable row level security;
revoke all on table public.delivery_cash_collections from anon, authenticated;
