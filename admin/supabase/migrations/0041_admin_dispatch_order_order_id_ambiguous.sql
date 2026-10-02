-- admin_dispatch_order has never run. It returns TABLE(order_id text,
-- offered_to integer), so `order_id` inside the body is a PL/pgSQL variable;
-- order_offers also has an order_id column, and the ON CONFLICT inference
-- clause cannot tell them apart:
--
--   ERROR 42702: column reference "order_id" is ambiguous
--
-- Qualifying the inference columns does not help -- Postgres rejects
-- `on conflict (o.order_id, ...)` and `on conflict (order_offers.order_id,
-- ...)` with a syntax error. The fix is #variable_conflict use_column, which
-- tells plpgsql to prefer the column on a name collision. It has to be the
-- first line inside the block, before DECLARE.
--
-- This is why 0035's claim path was untestable. admin_dispatch_order is the
-- only writer of order_offers, and claim_order refuses any order the rider was
-- not offered -- so with dispatch broken, no rider could ever claim anything.
-- available_jobs and fetch_rider_orders_page are reads and worked fine, which
-- is exactly why a dead write went unnoticed.
--
-- The only change to 0036's body is the one directive. Mechanically extracted.

create or replace function public.admin_dispatch_order(
  p_order_id text,
  p_rider_ids text[] default null
)
returns table (order_id text, offered_to integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_city text;
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  perform public.expire_stale_offers();

  select r.city into v_city
    from orders o
    join restaurants r on r.id = o.restaurant_id
   where o.id = p_order_id
     and o.rider_id is null
     and o.status in ('pending', 'confirmed');

  if v_city is null then
    raise exception 'That order is not available for dispatch. It may already have a rider.' using errcode = '22023';
  end if;

  insert into order_offers (order_id, rider_id, status, expires_at)
  select p_order_id, d.id, 'offered', now() + interval '5 minutes'
    from riders d
   where (
          (p_rider_ids is null and d.city = v_city)
          or (p_rider_ids is not null and d.id = any (p_rider_ids))
        )
     and d.status = 'online'
     and d.archived_at is null
     -- Declines stick: a rider who turned this order down is not asked again.
     and not exists (
       select 1 from order_offers f
        where f.order_id = p_order_id
          and f.rider_id = d.id
          and f.status = 'declined'
     )
  on conflict (order_id, rider_id) where status = 'offered'
  do update set expires_at = excluded.expires_at;

  get diagnostics v_count = row_count;

  order_id := p_order_id;
  offered_to := v_count;
  return next;
end;
$$;
