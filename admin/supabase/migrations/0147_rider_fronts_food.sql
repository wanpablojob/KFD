-- --------------------------------------------------------------------------
-- 0147: the rider pays the shop at pickup; the food is not handed in to KFD
--
-- The money model is: the rider pays the shop for the food when collecting
-- it, then collects the whole bill from the customer in cash. So of what the
-- rider collects, the food price already went to the shop. What is left (the
-- delivery and service fees) is handed in to KFD, and KFD pays the rider's
-- own fee through the payout ledger as before (0038, 0134). Keeping the fee
-- out of the cash as well would pay the rider twice.
--
-- Until now "on hand" was everything collected minus what was handed in, as
-- if the rider owed KFD the shop's money too (0079, 0092). Both functions are
-- rebuilt from their live definitions (0092) with the same columns:
--   collected    what customers paid the rider in cash (unchanged)
--   handed_over  what the rider has handed in (unchanged)
--   on_hand      collected - food paid to the shop - handed_over: the fees
--                still with the rider, owed to KFD
-- A merchant's sales are unaffected: they are the food subtotal of delivered
-- orders, never the delivery fee.
-- --------------------------------------------------------------------------

-- The part of the cash a rider collected that went to shops: the food they
-- paid for at pickup. Internal: only the two functions below call it.
create or replace function public.rider_cash_kept(p_rider_id text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select sum(o.subtotal)
      from rider_cash_collections y
      join orders o on o.id = y.order_id
     where y.rider_id = p_rider_id
  ), 0)
  + coalesce((
    select sum(
             coalesce((select sum(o.subtotal) from orders o
                        where o.delivery_id = w.delivery_id
                          and o.status <> 'cancelled'), 0))
      from delivery_cash_collections w
     where w.rider_id = p_rider_id
  ), 0);
$$;

comment on function public.rider_cash_kept(text) is
  'The part of a rider''s collected cash that went to shops: the food they paid for at pickup (0147). Internal to rider_cash_position and admin_rider_cash.';

revoke all on function public.rider_cash_kept(text) from public, anon, authenticated;

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
    -- The food went to the shop at pickup (0147); the fees are KFD's.
    coalesce(c.total, 0) - public.rider_cash_kept(v_rider_id) - coalesce(h.total, 0),
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
         -- Less the food paid to shops at pickup (0147), as in rider_cash_position.
         coalesce(c.total, 0) - public.rider_cash_kept(r.id) - coalesce(h.total, 0),
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
