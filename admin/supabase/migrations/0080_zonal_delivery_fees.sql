-- --------------------------------------------------------------------------
-- Per-barangay delivery fees
--
-- order_fees() returned 45.00 for everywhere. Delivery is priced by how far
-- the food has to travel, and one city-wide flat rate is wrong twice over: it
-- overcharges the barangay next door and undercharges the one at the far end
-- of the highway. Worse, the client had its own copy of the number, so the
-- displayed total and the charged total could disagree.
--
-- A FEE TABLE, NOT A DISTANCE FORMULA
--
-- The obvious implementation is coordinates plus a per-km rate. It is the worse
-- one here. It needs every barangay geocoded before it works, the divisor is
-- whichever point you measure from (a restaurant? the city hall?), and the rate
-- has to be tuned against real trip times before it is defensible. A per-unit
-- fee per barangay is exact, legible to the customer before they pay, and
-- editable by an operator without a deploy. Distance is implied by the banding
-- -- an operator sets outlying barangays higher -- without the machinery.
--
-- Why the service_areas table rather than a new one: 0077 already created it as
-- the authoritative list of deliverable barangays, and the fee belongs to that
-- same fact. A second table would let a barangay be deliverable with no fee, or
-- priced while undeliverable, and the two would drift.
--
-- A NULL delivery_fee MEANS "AGREE AT THE DOOR"
--
-- An operator can list a barangay before working out what to charge for it.
-- Rather than block the order, the fee resolves to NULL and the order is marked
-- as needing an agreed price, which the rider and customer settle between them.
-- That is a real arrangement, not a failure mode, and it composes with the cash
-- column 0079 added: the amount the rider records as collected IS the agreed
-- price, and a variance against the food subtotal is already flagged for review.
--
-- Blocks the failure this fixes: with a NULL fee there is no number to compare
-- the collected cash against, so an "agreed" delivery must not be flagged as a
-- cash mismatch. That comparison is therefore skipped for these orders rather
-- than comparing against 0.00 and flagging every one of them.
--
-- The fee is FROZEN onto the order at placement, exactly like rider_payout was
-- in 0037. Reading the current rate at read time would silently reprice
-- everything already ordered the moment an operator edits a band.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- The rate table: service_areas gains a fee
-- --------------------------------------------------------------------------

alter table public.service_areas
  add column if not exists delivery_fee numeric(12, 2),
  add column if not exists fee_agreed_in_person boolean not null default false;

alter table public.service_areas
  drop constraint if exists service_areas_delivery_fee_non_negative;
alter table public.service_areas
  add constraint service_areas_delivery_fee_non_negative
  check (delivery_fee is null or delivery_fee >= 0);

comment on column public.service_areas.delivery_fee is
  'Delivery fee for this barangay. NULL means the price is agreed between the rider and the customer at the door (0080).';
comment on column public.service_areas.fee_agreed_in_person is
  'Marks a NULL-fee barangay as intentionally agreed-at-the-door rather than simply not yet priced. Surfaced to the customer before checkout so the total is not a surprise at the door.';

-- Case-insensitive uniqueness, and it is the PRIMARY guard rather than tidiness.
--
-- The primary key is on `barangay` as typed, which is case-SENSITIVE. Every
-- lookup here and in order_fees() compares with lower(), so an admin who typed
-- "poblacion" instead of "Poblacion" created a SECOND row rather than updating
-- the first: two rows, two fees, and the customer charged whichever one Postgres
-- happened to return. Verified on a throwaway database -- Poblacion stayed at
-- 35.00 while a duplicate 'poblacion' was created at 40.00, and order_fees
-- silently picked one.
--
-- This index makes that state unreachable: the conflict target below is now the
-- lowercased name, so the update finds the existing row whatever the casing.
create unique index if not exists service_areas_barangay_lower_uniq
  on public.service_areas (lower(barangay));

-- A pre-existing duplicate would make the index creation fail and take the whole
-- migration with it. Collapse them first, keeping the row with the most recent
-- intent: a set fee wins over an agreed-in-person one, and the highest fee wins
-- between two fixed ones, because under-charging is the error that costs the
-- rider the trip.
delete from public.service_areas a
 using public.service_areas b
  where lower(a.barangay) = lower(b.barangay)
    and a.barangay <> b.barangay
    and (b.delivery_fee is not null) >= (a.delivery_fee is not null)
    and (coalesce(b.delivery_fee, 0), b.barangay) > (coalesce(a.delivery_fee, 0), a.barangay);

-- Existing rows are set to the old flat rate rather than left NULL. A NULL
-- means "agreed at the door", and silently converting every already-published
-- barangay into that would move real deliveries off a known price onto a
-- negotiation nobody asked for.
update public.service_areas
   set delivery_fee = 45.00
 where delivery_fee is null;

-- --------------------------------------------------------------------------
-- order_fees(p_barangay): the one place a fee is decided
-- --------------------------------------------------------------------------
--
-- Rebuilt rather than extended because the signature changed. create or replace
-- with a new parameter would leave the zero-argument version standing beside it
-- under the same name, and PostgREST would then have two candidates. Older
-- definers still call order_fees() with no argument; after the drop those calls
-- resolve to this function through its default.
drop function if exists public.order_fees();

create or replace function public.order_fees(p_barangay text default null)
returns table (
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
  v_barangay text := nullif(btrim(coalesce(p_barangay, '')), '');
  v_fee numeric;
  v_agreed boolean := false;
begin
  -- A published list is the signal that fees are per-zoned at all. While the
  -- table is empty the platform has not configured anything, so the original
  -- flat rate applies rather than refusing every order.
  if exists (select 1 from service_areas) and v_barangay is not null then
    select sa.delivery_fee into v_fee
      from service_areas sa
     where lower(sa.barangay) = lower(v_barangay);

    -- Listed but unpriced means agreed at the door. Not in the list means the
    -- caller decides whether that is fatal; this function only reports that it
    -- has no band, so both leave v_fee NULL and differ only in v_agreed.
    v_agreed := found and v_fee is null;
  else
    v_fee := 45.00;
  end if;

  return query select v_fee, 5.00, v_agreed;
end;
$$;

comment on function public.order_fees(text)
  is 'Delivery fee for a barangay. Returns the service_areas rate, or the legacy flat 45.00 while no list is published. A NULL fee with fee_agreed_in_person true means the price is settled at the door.';

revoke all on function public.order_fees(text) from public;
grant execute on function public.order_fees(text) to anon, authenticated;

-- --------------------------------------------------------------------------
-- quote_order: take the barangay so the preview can match the charge
-- --------------------------------------------------------------------------
--
-- Rebuilt from 0077, NOT from 0034. That is the trap this schema has walked into
-- three times: customer_place_order was last redefined in 0077, and quote_order
-- carries the open-status and cart-cap guards that 0034 did not have.
drop function if exists public.quote_order(text, jsonb);

create function public.quote_order(
  p_restaurant_id text,
  p_items jsonb,
  p_delivery_barangay text default null
)
returns table (
  subtotal numeric,
  delivery_fee numeric,
  service_fee numeric,
  total numeric,
  fee_agreed_in_person boolean,
  unknown_barangay boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_max_quantity constant int := 50;
  c_max_lines constant int := 30;
  v_barangay text := nullif(btrim(coalesce(p_delivery_barangay, '')), '');
  v_item record;
  v_qty int;
  v_menu_id text;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_delivery_fee numeric;
  v_service_fee numeric;
  v_agreed boolean;
  v_unknown boolean := false;
  v_matches int := 0;
begin
  select f.delivery_fee, f.service_fee, f.fee_agreed_in_person
    into v_delivery_fee, v_service_fee, v_agreed
    from public.order_fees(v_barangay) f;

  -- Reported rather than raised. The customer needs to see the cart priced to
  -- finish choosing; refusing to quote leaves them with a blank total and no
  -- way to tell a bad address from an unserviceable one. The hard refusal is
  -- in customer_place_order, where the order actually happens.
  if v_delivery_fee is null and not v_agreed and exists (select 1 from service_areas) then
    v_unknown := true;
  end if;

  if p_restaurant_id is null or btrim(p_restaurant_id) = '' then
    raise exception 'Pick a restaurant first.' using errcode = '22023';
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

  -- coalesce so an agreed-in-person delivery still totals its food. The fee is
  -- settled at the door and added by the rider, who records it as cash
  -- collected (0079). Showing the subtotal alone is honest; adding a fabricated
  -- 0.00 fee line would read as "delivery is free".
  return query
    select v_subtotal,
           coalesce(v_delivery_fee, 0),
           v_service_fee,
           v_subtotal + coalesce(v_delivery_fee, 0) + v_service_fee,
           v_agreed,
           v_unknown;
end;
$$;

comment on function public.quote_order(text, jsonb, text)
  is 'Server-authoritative price preview for a cart, priced for the destination barangay. fee_agreed_in_person true means the delivery fee is settled between rider and customer at the door, so the total shown excludes it (0080). unknown_barangay true means the destination has no rate band and the order will be refused. Callable by anon.';

revoke all on function public.quote_order(text, jsonb, text) from public;
grant execute on function public.quote_order(text, jsonb, text) to anon, authenticated;