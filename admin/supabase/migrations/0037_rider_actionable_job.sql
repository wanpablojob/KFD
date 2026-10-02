-- --------------------------------------------------------------------------
-- 0037: make the delivery job actionable
--
-- Everything here exists because the rider could see a reference, a restaurant
-- name and a customer name, and nothing else. The data was already on the row:
-- delivery_address since 0021, items since 0001. It was simply never selected.
--
-- Three additions and two fixes:
--
--   orders.customer_phone  -- snapshot of the customer's profile contact
--   orders.rider_payout   -- the agreed fee, frozen at claim time
--   fetch_rider_orders_page now returns both, plus delivery_address and items
--
-- The payout is snapshotted rather than computed on read on purpose. If the
-- rate changes next year, a delivery already completed must still read what it
-- was worth when it was agreed. Phase 3 replaces the lifetime aggregate with a
-- real ledger, but the snapshot is what makes that possible.
-- --------------------------------------------------------------------------

alter table orders
  add column if not exists customer_phone text,
  add column if not exists rider_payout numeric(12, 2);

comment on column orders.customer_phone is
  'Contact number copied from the customer''s profile at order time. NULL when they have not set one, which is why the rider card degrades to "no number on file" instead of a dead tel: link.';

comment on column orders.rider_payout is
  'Fee agreed for this delivery, frozen when a rider claimed it. NULL until claimed. A past delivery keeps the amount it was worth even if the rate changes.';

-- --------------------------------------------------------------------------
-- The rate
--
-- One function rather than a literal repeated in claim_order and the ledger, so
-- there is a single place to change it. Flat per delivery: 25.00, which is the
-- agreed business rate, not a placeholder. Phase 3 reads this too.
-- --------------------------------------------------------------------------

create or replace function public.rider_payout_per_delivery()
returns numeric
language sql
stable
as $$
  select 25.00::numeric;
$$;

comment on function public.rider_payout_per_delivery() is
  'Flat fee per completed delivery, in pesos. The single definition of the rider rate.';

revoke all on function public.rider_payout_per_delivery() from public;
revoke all on function public.rider_payout_per_delivery() from anon;
grant execute on function public.rider_payout_per_delivery() to authenticated;

-- --------------------------------------------------------------------------
-- Order placement: snapshot the contact number
--
-- There is no order -> customers join path (customers.id is free text with no
-- auth link, and orders.customer_user_id is a uuid), so the profile contact
-- lives on the auth account and is copied here at order time. Same resolution
-- order as the display name directly above it: metadata, then nothing. A
-- customer with no phone on file still places an order -- the rider card simply
-- has no number to dial, which is honest.
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
    ),
    nullif(btrim(raw_user_meta_data ->> 'phone'), '')
    into v_customer_name, v_customer_phone
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
    status, payment, placed_at, rider, customer_user_id, delivery_address,
    customer_phone
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
    nullif(btrim(coalesce(p_delivery_address, '')), ''),
    v_customer_phone
  returning id into v_order_id;

  return query
    select v_order_id, v_reference, v_total, 'pending'::order_status;
end;
$$;

comment on function public.customer_place_order(text, jsonb, text, payment_method) is
  'Places an order at server-computed prices and snapshots the customer''s profile contact number onto the order for the rider.';

revoke all on function public.customer_place_order(text, jsonb, text, payment_method) from public;
revoke all on function public.customer_place_order(text, jsonb, text, payment_method) from anon;
grant execute on function public.customer_place_order(text, jsonb, text, payment_method) to authenticated;

-- --------------------------------------------------------------------------
-- Rider feed: stop hiding what the rider needs
--
-- Return table changes, so this must be dropped and recreated rather than
-- replaced -- CREATE OR REPLACE cannot alter a function's return type. Grants
-- are re-applied below because the new function is a new object.
-- --------------------------------------------------------------------------

drop function if exists public.fetch_rider_orders_page(timestamptz, int);

create function public.fetch_rider_orders_page(
  p_cursor timestamptz default null,
  p_limit int default 20
)
returns table (
  id text,
  reference text,
  customer text,
  customer_phone text,
  restaurant text,
  delivery_address text,
  items jsonb,
  total numeric,
  rider_payout numeric,
  status order_status,
  payment payment_method,
  placed_at timestamptz,
  next_cursor timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
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
      case when count(*) over () > p_limit then o.placed_at else null end as next_cursor
    from orders o
   where o.rider_id = v_rider_id
     and (p_cursor is null or o.placed_at < p_cursor)
   order by o.placed_at desc
   limit p_limit;
end;
$$;

comment on function public.fetch_rider_orders_page(timestamptz, int)
  is 'Cursor-paginated orders for the calling rider, including where to go, what to pick up, how to reach the customer and the agreed fee. Cursor is the placed_at of the last item in the previous page (exclusive). Returns next_cursor when more pages exist.';

revoke all on function public.fetch_rider_orders_page(timestamptz, int) from public;
revoke all on function public.fetch_rider_orders_page(timestamptz, int) from anon;
grant execute on function public.fetch_rider_orders_page(timestamptz, int) to authenticated;

-- --------------------------------------------------------------------------
-- Claim: freeze the agreed fee
--
-- Dropped and recreated for the same return-type reason as above.
-- --------------------------------------------------------------------------

drop function if exists public.claim_order(text);

create function public.claim_order(p_order_id text)
returns table (
  order_id text,
  reference text,
  restaurant text,
  delivery_address text,
  items jsonb,
  total numeric,
  rider_payout numeric,
  payment payment_method,
  placed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider_id text;
  v_rider_name text;
begin
  perform public.expire_stale_offers();

  select r.id, r.name into v_rider_id, v_rider_name
    from riders r
   where r.user_id = auth.uid()
     and r.archived_at is null;

  if v_rider_id is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from order_offers f
     where f.order_id = p_order_id
       and f.rider_id = v_rider_id
       and f.status = 'offered'
       and f.expires_at > now()
  ) then
    raise exception 'That delivery is no longer available.' using errcode = '40001';
  end if;

  update orders o
     set rider_id = v_rider_id,
         -- Display mirror for admin (queries.ts still selects orders.rider).
         -- Written here and nowhere else; rider_id remains the source of truth.
         rider = v_rider_name,
         -- Frozen now, not read at payout time.
         rider_payout = public.rider_payout_per_delivery()
   where o.id = p_order_id
     and o.rider_id is null
     and o.status in ('pending', 'confirmed')
  returning o.id, o.reference, o.restaurant, o.delivery_address,
            o.items, o.total, o.rider_payout, o.payment, o.placed_at
    into order_id, reference, restaurant, delivery_address,
         items, total, rider_payout, payment, placed_at;

  if order_id is null then
    raise exception 'Someone else already took this delivery.' using errcode = '40001';
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
$$;

comment on function public.claim_order(text) is
  'Atomically claims an offered delivery for the calling rider, assigns orders.rider_id and freezes the agreed fee onto the order. Exactly one rider can win a contested claim.';

revoke all on function public.claim_order(text) from public;
revoke all on function public.claim_order(text) from anon;
grant execute on function public.claim_order(text) to authenticated;

-- --------------------------------------------------------------------------
-- Mark delivered: pay the rider
--
-- One change only: this bumped `deliveries` but never `earnings`, so the
-- Earnings tab read 0 no matter how many deliveries were completed. The frozen
-- payout is now added on completion.
--
-- The ownership check is left exactly as 0025 wrote it -- a single query
-- reading status and rider_id into separate variables, then `is distinct
-- from`. 0018's version compared the free-text orders.rider against the
-- caller's name, and 0025 had already replaced that. Do not "simplify" the
-- check into `<>`: with a NULL rider_id, `null <> 'abc'` is NULL rather than
-- true, so the guard would silently pass and any rider could complete an
-- unassigned order. `is distinct from` is what makes NULL a rejection.
--
-- Still the lifetime aggregate, not a ledger. Phase 3 adds per-delivery
-- history.
-- --------------------------------------------------------------------------

create or replace function public.rider_mark_delivered(p_order_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider_id text;
  v_order_rider_id text;
  v_status order_status;
  v_payout numeric;
begin
  select r.id into v_rider_id
    from riders r
   where r.user_id = auth.uid();

  if v_rider_id is null then
    raise exception 'Your account is not linked to a rider.'
      using errcode = '42501';
  end if;

  -- Read the order's assignee into its OWN variable. This previously selected
  -- into v_rider_id, overwriting the caller's id with the order's, so the
  -- ownership check below compared the order's rider against itself and could
  -- never fail -- any authenticated rider could mark any order delivered.
  select o.status, o.rider_id, o.rider_payout
    into v_status, v_order_rider_id, v_payout
    from orders o
   where o.id = p_order_id;

  if v_status is null then
    raise exception 'No order with id %.', p_order_id;
  end if;

  if v_order_rider_id is distinct from v_rider_id then
    raise exception 'That order is not assigned to you.'
      using errcode = '42501';
  end if;

  if v_status not in ('out_for_delivery', 'confirmed', 'preparing') then
    raise exception 'That order cannot be marked delivered from its current state (%).', v_status;
  end if;

  update orders
     set status = 'delivered'
   where id = p_order_id;

  update riders
     set deliveries = deliveries + 1,
         -- The fee frozen onto the order at claim time. Still the lifetime
         -- aggregate, not a ledger -- Phase 3 adds per-delivery history.
         earnings = earnings + coalesce(v_payout, 0)
   where id = v_rider_id;
end;
$$;

comment on function public.rider_mark_delivered(text)
  is 'Mark one of your assigned orders delivered, bump your delivery count and add the frozen payout to your earnings. Rider only, matched on rider_id.';

revoke all on function public.rider_mark_delivered(text) from public;
revoke all on function public.rider_mark_delivered(text) from anon;
grant execute on function public.rider_mark_delivered(text) to authenticated;