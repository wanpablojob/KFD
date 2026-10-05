-- --------------------------------------------------------------------------
-- order ratings (restaurant + rider), one per delivered order
--
-- restaurants.rating and riders.rating have existed since 0001 but nothing ever
-- wrote them: the seed value was a permanent lie. A customer can now rate the
-- restaurant (always) and the rider (when the order had one), once per order,
-- after delivery. The RPC rolls the averages back up so the columns mean
-- something.
--
-- order_id is the primary key: one rating per order, and a re-rate updates in
-- place. Ownership is the order's customer, checked in the RPC.
-- --------------------------------------------------------------------------

create table if not exists public.order_ratings (
  order_id text primary key references public.orders(id) on delete cascade,
  customer_user_id uuid not null,
  restaurant_id text references public.restaurants(id) on delete set null,
  rider_id text references public.riders(id) on delete set null,
  restaurant_rating int not null check (restaurant_rating between 1 and 5),
  rider_rating int check (rider_rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.order_ratings is
  'One rating per delivered order. rider_rating is null when the order had no rider (or the customer skipped it). rate_order() keeps the restaurants/riders averages in step.';

alter table public.order_ratings enable row level security;

-- Customers may read their own ratings (drives the "already rated" state).
create policy "customers read own ratings"
  on public.order_ratings
  for select
  to authenticated
  using (customer_user_id = auth.uid());

-- No insert/update policy: all writes go through rate_order(), a security
-- definer function that re-checks ownership and status.

-- --------------------------------------------------------------------------
-- rate_order
-- --------------------------------------------------------------------------
create function public.rate_order(
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
  is 'Rate a delivered order''s restaurant (and rider, when there was one). One rating per order; re-rating updates in place and re-rolls the averages.';

revoke all on function public.rate_order(text, int, int, text) from public;
revoke all on function public.rate_order(text, int, int, text) from anon;
grant execute on function public.rate_order(text, int, int, text) to authenticated;

-- --------------------------------------------------------------------------
-- my_ratings: the caller's own ratings, so the list can show "Rated".
-- --------------------------------------------------------------------------
create function public.my_ratings()
returns table (
  order_id text,
  restaurant_rating int,
  rider_rating int,
  comment text
)
language sql
stable
security invoker
set search_path = public
as $$
  select order_id, restaurant_rating, rider_rating, comment
    from order_ratings
   where customer_user_id = auth.uid();
$$;

revoke all on function public.my_ratings() from public;
revoke all on function public.my_ratings() from anon;
grant execute on function public.my_ratings() to authenticated;
