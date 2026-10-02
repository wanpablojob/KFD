-- A rider tapping Accept on a delivery that was already taken or expired got
-- an infinite hang, not an error message. The cause is the errcode, not the
-- logic. PostgREST treats SQLSTATE 40001 (serialization_failure) as a
-- retryable conflict and re-runs the request forever; but these raises are
-- deterministic business rules, so every retry fails the same way.
--
-- Measured against the live project, same scratch function, only the code
-- varied:
--
--   40001 -> http=000, still running after 8s (never returns)
--   P0001 -> http=400 in 0.38s
--   42501 -> http=401 in 0.24s
--   P0002 -> http=500 in 0.27s
--
-- This is also the real cause of the "upstream request timeout" on the very
-- first claim attempt, which looked like a network fault.
--
-- P0001 is plpgsql's default raise code and surfaces as HTTP 400 with the
-- message intact, which is all the app uses -- no client code inspects 40001,
-- so nothing downstream changes.
--
-- Two definitions are live: claim_order (0042) and decline_order (still 0035's,
-- never redefined). Both re-emitted with only the errcodes changed, extracted
-- mechanically.

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
    raise exception 'That delivery is no longer available.' using errcode = 'P0001';
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
    raise exception 'Someone else already took this delivery.' using errcode = 'P0001';
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

comment on function public.decline_order(text, text) is
  'Declines a delivery offer. The order returns to the pool unassigned rather than expiring.';

create or replace function public.decline_order(
  p_order_id text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider_id text;
begin
  perform public.expire_stale_offers();

  v_rider_id := public.current_rider_id();
  if v_rider_id is null then
    raise exception 'Your account is not linked to a rider.' using errcode = '42501';
  end if;

  update order_offers
     set status = 'declined',
         decline_reason = nullif(btrim(p_reason), '')
   where order_id = p_order_id
     and rider_id = v_rider_id
     and status = 'offered';

  if not found then
    raise exception 'That delivery is no longer available.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.decline_order(text, text) from public;
revoke all on function public.decline_order(text, text) from anon;
grant execute on function public.decline_order(text, text) to authenticated;
