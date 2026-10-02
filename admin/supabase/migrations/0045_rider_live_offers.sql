-- Phase 4, item 2 groundwork: the rider half of dispatch.
--
-- The offer side has existed since 0035 (order_offers, claim_order,
-- decline_order), and Phase 1 unblocked it, but there was never any way for a
-- rider to *see* an offer. grep over mobile/src finds zero references to
-- order_offers: the rider app could only read orders already assigned to them
-- (fetch_rider_orders_page), so the accept/decline surface did not exist at all.
--
-- This adds the read path only. Auto-dispatch on placement and bounce-on-decline
-- are separate migrations so the visible half can ship and be exercised before
-- the half that changes who gets work.
--
-- Live offers only: status 'offered' and not yet past expires_at. A rider sees
-- the same set the claim path will accept, so the screen cannot offer something
-- that claim_order would then refuse.
--
-- Security definer because the rider's own rows in order_offers are not
-- readable under RLS (the 0018 policy covers orders assigned to them, not
-- offers addressed to them). The rider id comes from current_rider_id(), never
-- from a parameter, so this cannot be used to read another rider's offers.
--
-- Left join to orders and restaurants: an offer whose order was cancelled
-- between offer and read still shows, with a status the UI can render as
-- unavailable, rather than vanishing and leaving the rider tapping a dead row.

create or replace function public.fetch_rider_offers()
returns table (
  offer_id bigint,
  order_id text,
  reference text,
  restaurant text,
  customer text,
  delivery_address text,
  items jsonb,
  total numeric,
  rider_payout numeric,
  order_status order_status,
  payout_per_delivery numeric,
  city text,
  offered_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id,
    o.id,
    o.reference,
    o.restaurant,
    o.customer,
    o.delivery_address,
    o.items,
    o.total,
    o.rider_payout,
    o.status,
    public.rider_payout_per_delivery(),
    r.city,
    f.offered_at,
    f.expires_at
  from order_offers f
  join orders o on o.id = f.order_id
  join restaurants r on r.id = o.restaurant_id
  where f.rider_id = public.current_rider_id()
    and f.status = 'offered'
    and f.expires_at > now()
  order by f.offered_at desc;
$$;

comment on function public.fetch_rider_offers() is
  'Live delivery offers addressed to the calling rider, soonest-expiring first by offered_at. Riders only.';

revoke all on function public.fetch_rider_offers() from public;
revoke all on function public.fetch_rider_offers() from anon;
grant execute on function public.fetch_rider_offers() to authenticated;
