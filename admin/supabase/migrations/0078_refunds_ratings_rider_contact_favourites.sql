-- --------------------------------------------------------------------------
-- Refunds, ratings visibility, rider contact and favourites
--
-- 1. REFUNDS. There was nowhere to record money given back. order_refunds is
--    the ledger, written only by admin_record_refund (admins; never more than
--    the order total across all refunds). The customer can read refunds on
--    their own orders. Each row records who refunded and when, so it is its own
--    audit trail.
-- 2. RATINGS. order_ratings (0055) was readable only by the rating customer,
--    so nobody running the business could see feedback. Admins now read all;
--    merchants read their own restaurant's.
-- 3. RIDER CONTACT. The rider could call the customer; the customer could not
--    reach the rider. order_rider_contact returns the assigned rider's name and
--    phone to the order's own customer, only while the order is in progress.
-- 4. FAVOURITES. customer_favorites lets a customer keep restaurants they
--    order from often.
-- 5. RATING NEVER WORKED. rate_order (0055) returns columns named like the
--    order_ratings columns it writes, so PL/pgSQL reported "column reference
--    order_id is ambiguous" on every call. Rebuilt from 0055 with
--    #variable_conflict use_column; the logic is unchanged.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- order_refunds
-- --------------------------------------------------------------------------
create table if not exists public.order_refunds (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null check (method in ('cash', 'gcash')),
  reason text not null check (length(btrim(reason)) > 0),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists order_refunds_order_idx on public.order_refunds (order_id);
comment on table public.order_refunds is
  'Money returned to a customer, one row per refund. Written only by admin_record_refund (0078).';

alter table public.order_refunds enable row level security;
drop policy if exists "admins read refunds" on public.order_refunds;
create policy "admins read refunds"
  on public.order_refunds for select to authenticated
  using (public.is_platform_admin());
drop policy if exists "customers read own refunds" on public.order_refunds;
create policy "customers read own refunds"
  on public.order_refunds for select to authenticated
  using (exists (
    select 1 from public.orders o
     where o.id = order_refunds.order_id and o.customer_user_id = auth.uid()
  ));
grant select on public.order_refunds to authenticated;

create or replace function public.admin_record_refund(
  p_order_id text,
  p_amount numeric,
  p_method text,
  p_reason text
)
returns table (id bigint, order_id text, amount numeric, refunded_total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
  v_refunded numeric;
  v_id bigint;
begin
  if not public.is_platform_admin() then
    raise exception 'Only an admin can record a refund.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Refund amount must be more than zero.' using errcode = '22023';
  end if;
  if p_method is null or p_method not in ('cash', 'gcash') then
    raise exception 'Refund method must be cash or gcash.' using errcode = '22023';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Give a reason for the refund.' using errcode = '22023';
  end if;

  -- Lock the order so two admins cannot refund past the total at once.
  select o.total into v_total from orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0001';
  end if;

  select coalesce(sum(r.amount), 0) into v_refunded
    from order_refunds r where r.order_id = p_order_id;

  if v_refunded + p_amount > v_total then
    raise exception 'That would refund more than the order total (% already refunded of %).',
      v_refunded, v_total using errcode = '22023';
  end if;

  insert into order_refunds (order_id, amount, method, reason, recorded_by)
  values (p_order_id, round(p_amount, 2), p_method, btrim(p_reason), auth.uid())
  returning order_refunds.id into v_id;

  return query select v_id, p_order_id, round(p_amount, 2), v_refunded + round(p_amount, 2);
end;
$$;
comment on function public.admin_record_refund(text, numeric, text, text)
  is 'Admin records money returned to a customer. Total refunds can never exceed the order total (0078).';
revoke all on function public.admin_record_refund(text, numeric, text, text) from public;
revoke all on function public.admin_record_refund(text, numeric, text, text) from anon;
grant execute on function public.admin_record_refund(text, numeric, text, text) to authenticated;

-- --------------------------------------------------------------------------
-- order_ratings visibility
-- --------------------------------------------------------------------------
drop policy if exists "admins read ratings" on public.order_ratings;
create policy "admins read ratings"
  on public.order_ratings for select to authenticated
  using (public.is_platform_admin());
drop policy if exists "merchants read own restaurant ratings" on public.order_ratings;
create policy "merchants read own restaurant ratings"
  on public.order_ratings for select to authenticated
  using (restaurant_id = public.current_merchant_restaurant());

-- --------------------------------------------------------------------------
-- order_rider_contact
-- --------------------------------------------------------------------------
create or replace function public.order_rider_contact(p_reference text)
returns table (rider_name text, rider_phone text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row orders;
  v_ref text := upper(replace(btrim(coalesce(p_reference, '')), '#', ''));
begin
  if auth.uid() is null then
    raise exception 'Sign in to contact your rider.' using errcode = '42501';
  end if;

  select * into v_row
    from orders o
   where upper(replace(o.reference, '#', '')) = v_ref
   limit 1;

  -- Only the order's own customer, only while it is in progress, only once a
  -- rider is assigned. Anything else returns nothing rather than an error, so
  -- the screen simply shows no contact buttons.
  if not found
     or v_row.customer_user_id is distinct from auth.uid()
     or v_row.rider_id is null
     or v_row.status not in ('confirmed', 'preparing', 'out_for_delivery') then
    return;
  end if;

  return query
    select r.name, nullif(btrim(r.phone), '')
      from riders r
     where r.id = v_row.rider_id;
end;
$$;
comment on function public.order_rider_contact(text)
  is 'The assigned rider''s name and phone, for the order''s own customer while the order is in progress (0078).';
revoke all on function public.order_rider_contact(text) from public;
revoke all on function public.order_rider_contact(text) from anon;
grant execute on function public.order_rider_contact(text) to authenticated;

-- --------------------------------------------------------------------------
-- customer_favorites
-- --------------------------------------------------------------------------
create table if not exists public.customer_favorites (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, restaurant_id)
);
comment on table public.customer_favorites is 'Restaurants a customer saved (0078).';

alter table public.customer_favorites enable row level security;
drop policy if exists "customers manage own favorites" on public.customer_favorites;
create policy "customers manage own favorites"
  on public.customer_favorites for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
grant select, insert, delete on public.customer_favorites to authenticated;

-- --------------------------------------------------------------------------
-- rate_order: rebuilt from 0055 with #variable_conflict use_column
-- --------------------------------------------------------------------------
create or replace function public.rate_order(
  p_order_id text,
  p_restaurant_rating int,
  p_rider_rating int default null,
  p_comment text default null
)
returns table (
  order_id text,
  restaurant_rating int,
  rider_rating int
)
language plpgsql
security definer
set search_path = public
as $$
-- The OUT columns (order_id, restaurant_rating, rider_rating) share names with
-- order_ratings columns; without this, ON CONFLICT (order_id) and the avg()
-- roll-ups are ambiguous and every rating fails at runtime.
#variable_conflict use_column
declare
  v_row orders;
  v_rider_rating int;
begin
  if auth.uid() is null then
    raise exception 'Sign in to rate an order.' using errcode = '42501';
  end if;

  if p_restaurant_rating is null
     or p_restaurant_rating < 1 or p_restaurant_rating > 5 then
    raise exception 'Rating must be between 1 and 5.' using errcode = 'P0001';
  end if;

  if p_rider_rating is not null
     and (p_rider_rating < 1 or p_rider_rating > 5) then
    raise exception 'Rider rating must be between 1 and 5.' using errcode = 'P0001';
  end if;

  select * into v_row from orders o where o.id = p_order_id;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0001';
  end if;

  if v_row.customer_user_id is distinct from auth.uid() then
    raise exception 'This is not your order.' using errcode = '42501';
  end if;

  if v_row.status <> 'delivered' then
    raise exception 'You can rate an order once it is delivered.' using errcode = 'P0001';
  end if;

  -- A rider rating only counts when the order actually had a rider.
  v_rider_rating := case
    when v_row.rider_id is not null then p_rider_rating
    else null
  end;

  insert into order_ratings (
    order_id, customer_user_id, restaurant_id, rider_id,
    restaurant_rating, rider_rating, comment
  )
  values (
    p_order_id, auth.uid(), v_row.restaurant_id, v_row.rider_id,
    p_restaurant_rating, v_rider_rating,
    nullif(btrim(coalesce(p_comment, '')), '')
  )
  on conflict (order_id) do update
    set restaurant_rating = excluded.restaurant_rating,
        rider_rating = excluded.rider_rating,
        comment = excluded.comment,
        updated_at = now();

  -- Roll the restaurant average back up so restaurants.rating reflects real
  -- ratings instead of the seed value.
  if v_row.restaurant_id is not null then
    update restaurants r
       set rating = coalesce((
         select round(avg(restaurant_rating)::numeric, 1)
           from order_ratings
          where restaurant_id = v_row.restaurant_id
       ), r.rating)
     where r.id = v_row.restaurant_id;
  end if;

  -- Same for the rider's average.
  if v_row.rider_id is not null then
    update riders rd
       set rating = coalesce((
         select round(avg(rider_rating)::numeric, 1)
           from order_ratings
          where rider_id = v_row.rider_id and rider_rating is not null
       ), rd.rating)
     where rd.id = v_row.rider_id;
  end if;

  return query select p_order_id, p_restaurant_rating, v_rider_rating;
end;
$$;
comment on function public.rate_order(text, int, int, text)
  is 'Customer rates a delivered order (1-5 restaurant, optional 1-5 rider, optional comment); re-rating updates in place and rolls the averages up. 0055, fixed in 0078.';
revoke all on function public.rate_order(text, int, int, text) from public;
revoke all on function public.rate_order(text, int, int, text) from anon;
grant execute on function public.rate_order(text, int, int, text) to authenticated;
