-- claim_order was dead too, same root cause as admin_dispatch_order (0041).
-- It returns TABLE(order_id text, ...) so `order_id` is a PL/pgSQL variable,
-- and order_offers has an order_id column. The `update order_offers ...
-- where order_id = p_order_id` statements resolve to both and Postgres raises:
--
--   ERROR 42702: column reference "order_id" is ambiguous
--
-- It never showed up before because the function raised earlier: no offer, or
-- no linked rider. It only reached the ambiguous statement once an offer
-- actually existed -- which, until 0041, was impossible.
--
-- With use_column the WHERE names resolve to the columns (what they mean) and
-- the `into order_id, ...` targets stay variables; plpgsql always treats INTO
-- targets as variables.
--
-- Base is 0037's definition, which widened the return type for the actionable
-- job; a 0035-based copy fails with 42P13. create or replace is safe here
-- because 0042 keeps 0037's exact signature and return columns. Extracted
-- mechanically, one line added.

create or replace function public.claim_order(p_order_id text)
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
#variable_conflict use_column
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
