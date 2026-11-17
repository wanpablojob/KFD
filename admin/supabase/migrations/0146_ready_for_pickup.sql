-- --------------------------------------------------------------------------
-- 0146: "Ready for pickup", between preparing and on the way
--
-- The kitchen had no way to say the food is packed and waiting, so the rider
-- and the customer saw "Being prepared" until the rider collected it.
--
-- It is a timestamp, not a new order_status value, on purpose. Dozens of
-- functions, triggers and policies list the statuses an order can be in while
-- it is still running (dispatch, re-offers, pickup, delivery, failure,
-- settlement, trips). A new enum value missing from any one of those lists
-- would quietly treat a ready order as finished or unknown. As a timestamp the
-- order stays `preparing` for every one of those rules, and the apps show
-- "Ready for pickup" when ready_for_pickup_at is set.
--
-- merchant_mark_ready() is how the kitchen sets it; the three read functions
-- the apps use for status (track_order, fetch_rider_orders_page,
-- delivery_stops) now return it. Each is rebuilt from its live definition with
-- only that column added; the return type changes, so each is dropped first,
-- in this migration's transaction.
-- --------------------------------------------------------------------------

alter table public.orders
  add column if not exists ready_for_pickup_at timestamptz;

comment on column public.orders.ready_for_pickup_at is
  'When the shop marked the food packed and waiting for the rider (0146). Null until then. The order stays preparing.';

create or replace function public.merchant_mark_ready(p_order_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.orders;
begin
  select * into v_row from public.orders where id = p_order_id;
  if not found then
    raise exception 'No order with id %.', p_order_id;
  end if;

  -- The shop's own order, or a platform admin. Nobody else.
  if not (
    public.is_platform_admin()
    or (v_row.restaurant_id is not null
        and v_row.restaurant_id = public.current_merchant_restaurant())
  ) then
    raise exception 'That order is not your shop''s.' using errcode = '42501';
  end if;

  -- Ready means cooked: only an order still at the kitchen. Marking ready
  -- straight from confirmed also counts as having prepared it.
  if v_row.status not in ('confirmed', 'preparing') then
    raise exception 'That order cannot be marked ready from its current state (%).', v_row.status;
  end if;

  update public.orders
     set status = 'preparing',
         ready_for_pickup_at = coalesce(ready_for_pickup_at, now())
   where id = p_order_id;
end;
$$;

comment on function public.merchant_mark_ready(text) is
  'The shop marks its order packed and waiting for the rider (0146). Sets ready_for_pickup_at; the order stays preparing until the rider picks it up.';

revoke all on function public.merchant_mark_ready(text) from public, anon;
grant execute on function public.merchant_mark_ready(text) to authenticated;

-- track_order ----------------------------------------------------------------

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
  prep_minutes int,
  ready_for_pickup_at timestamptz
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
      v_row.prep_minutes,
      v_row.ready_for_pickup_at;
end;
$$;

comment on function public.track_order(text)
  is 'Public order tracking by reference. Returns the order projection, with the fee breakdown, the prep_minutes snapshot for the delivery estimate (0077) and ready_for_pickup_at (0146). delivery_address is returned only to the order''s own customer; every other caller gets NULL.';

revoke all on function public.track_order(text) from public;
grant execute on function public.track_order(text) to anon, authenticated;

-- fetch_rider_orders_page -------------------------------------------------------

drop function if exists public.fetch_rider_orders_page(timestamptz, int, boolean);

create function public.fetch_rider_orders_page(
  p_cursor timestamp with time zone default null,
  p_limit integer default 20,
  p_only_legacy boolean default false
)
 RETURNS TABLE(id text, reference text, customer text, customer_phone text, restaurant text, delivery_address text, items jsonb, total numeric, rider_payout numeric, status order_status, payment payment_method, placed_at timestamp with time zone, delivery_id text, next_cursor timestamp with time zone, ready_for_pickup_at timestamp with time zone)
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
      case when count(*) over () > p_limit then o.placed_at else null end as next_cursor,
      o.ready_for_pickup_at
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

revoke all on function public.fetch_rider_orders_page(timestamptz, int, boolean) from public, anon;
grant execute on function public.fetch_rider_orders_page(timestamptz, int, boolean) to authenticated;

-- delivery_stops ---------------------------------------------------------------

drop function if exists public.delivery_stops(text);

create function public.delivery_stops(p_delivery_id text)
returns table (
  order_id text,
  reference text,
  restaurant text,
  restaurant_id text,
  items jsonb,
  subtotal numeric,
  status public.order_status,
  -- The merchant's own estimate, snapshotted when the order was placed.
  prep_minutes int,
  -- When this shop's food will be ready.
  ready_at timestamptz,
  -- 1, 2, 3... in the order to visit. Null for a stop that is not on the
  -- route any more: already collected, or the shop cancelled.
  stop_order int,
  -- The shop said the food is packed and waiting (0146).
  ready_for_pickup_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    exists (
      select 1 from public.deliveries d
       where d.id = p_delivery_id
         and d.customer_user_id = auth.uid()
    )
    or exists (
      select 1 from public.deliveries d
       where d.id = p_delivery_id
         and d.rider_id = public.current_rider_id()
    )
    or public.is_platform_admin()
  ) then
    return;
  end if;

  return query
    with stops as (
      select o.id,
             o.reference,
             o.restaurant,
             o.restaurant_id,
             o.items,
             o.subtotal,
             o.status,
             o.placed_at,
             o.ready_for_pickup_at,
             -- 20 is the same default the app uses for an order placed before
             -- prep times were recorded (delivery-estimate.ts). The two must
             -- agree, or the rider sees a ready time the customer was never
             -- told.
             coalesce(o.prep_minutes, 20) as prep,
             o.placed_at + make_interval(mins => coalesce(o.prep_minutes, 20)) as ready,
             case
               when o.status in ('pending', 'confirmed', 'preparing') then 0
               when o.status in ('out_for_delivery', 'delivered') then 1
               else 2
             end as grp
        from public.orders o
       where o.delivery_id = p_delivery_id
    ),
    numbered as (
      select s.*,
             -- The visits are numbered first (grp 0 sorts ahead of the rest),
             -- so the numbers run 1, 2, 3... over the route and not over the
             -- whole list.
             row_number() over (
               order by s.grp, s.ready desc nulls last, s.placed_at, s.reference
             ) as seq
        from stops s
    )
    select n.id,
           n.reference,
           n.restaurant,
           n.restaurant_id,
           n.items,
           n.subtotal,
           n.status,
           n.prep,
           n.ready,
           case when n.grp = 0 then n.seq::int end,
           n.ready_for_pickup_at
      from numbered n
     order by n.grp, n.ready desc nulls last, n.placed_at, n.reference;
end;
$$;

comment on function public.delivery_stops(text)
  is 'The shops of a trip, in the order to visit them, for the rider''s trip screen and the customer''s tracking (0111). The stop whose food is ready last is visited first, so the rider never waits at a kitchen. prep_minutes and ready_at are the shop''s own estimate; stop_order is the number of the stop on the route, and null for one that is already collected or cancelled; ready_for_pickup_at is when the shop marked it packed (0146).';

revoke all on function public.delivery_stops(text) from public, anon;
grant execute on function public.delivery_stops(text) to authenticated;
