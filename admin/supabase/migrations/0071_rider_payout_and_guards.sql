-- --------------------------------------------------------------------------
-- Restore the frozen rider payout, and close the guard gaps 0050 opened
--
-- Three defects, all in the rider money/state path.
--
-- 1. THE PAYOUT FREEZE WAS DELETED. claim_order used to write
--       rider_payout = public.rider_payout_per_delivery()
--    at claim time (0037), which is what makes a delivery worth a fixed amount
--    rather than whatever the rate says later. 0050_rider_suspension.sql
--    redefined claim_order -- correctly, to add its suspension guards -- but
--    rebuilt it from the 0035/0036 body instead of the latest one, and the
--    freeze went with it. 0050 has zero references to rider_payout where 0043
--    had four.
--
--    The consequence is not cosmetic. rider_mark_delivered (0038) writes the
--    ledger row with coalesce(v_payout, 0), so a NULL payout became a REAL
--    0.00 ledger row, and rider_payouts has unique (order_id) so that row can
--    never be corrected by re-claiming. Since 0038 the ledger is the sole source
--    for every money figure in the product, so real deliveries have been
--    recording 0.00 and the Earnings tab, the rider profile and
--    admin_rider_payout_summary all report the rider as having earned nothing.
--
--    Every body below is rebuilt from the LATEST definer (0043 for claim_order,
--    0038 for rider_mark_delivered, 0044 for rider_report_failed_delivery),
--    plus the guard 0050 added. This is the trap SKILL.md:123-130 documents;
--    it has now been walked into twice.
--
-- 2. SUSPENSION AND ARCHIVING WERE ONLY ENFORCED AT THE DOOR. claim_order
--    checked both. rider_mark_delivered did not check either, so a rider an
--    admin had suspended could still complete deliveries they already held and
--    be paid for them. rider_report_failed_delivery checked archived but not
--    suspended. rider_set_status checked only that a rider row existed, so a
--    suspended rider could put themselves back online.
--
-- 3. THE COUNTERS DRIFTED, AND A DOUBLE-TAP DOUBLE-COUNTED.
--    rider_mark_delivered incremented riders.deliveries and riders.earnings in
--    parallel with the ledger. The ledger has on delete cascade on order_id, so
--    deleting an order removed the ledger row and left the counter inflated
--    forever, with nothing to reconcile it. And because the status guard lived
--    only in plpgsql, not in the UPDATE's WHERE, two concurrent calls both read
--    'confirmed', both passed, and both incremented. The ledger insert was
--    protected by unique (order_id); the counters were not.
--
-- Both are fixed by the same two changes: the status precondition moves into
-- the UPDATE (so the second concurrent call affects zero rows and is told so),
-- and the counters are RECOMPUTED from the ledger instead of incremented. A
-- recompute is idempotent and self-healing, which is the same reasoning 0008
-- used for the restaurant aggregates: deltas drift, recomputes cannot.
--
-- Existing zero ledger rows are NOT rewritten here. Money rows are the audit
-- record, and silently editing them is a decision for an operator who can see
-- which deliveries are affected. A reviewed remediation query is at the bottom.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- Retire the 0001 seed orders the preflight below would otherwise trip on
-- --------------------------------------------------------------------------
--
-- 0001_init.sql seeds demo orders ord_1002..ord_1004 as confirmed / preparing /
-- out_for_delivery, and a later migration links them to riders. They were never
-- claimed, so they have no frozen fee, and the preflight below counts them as
-- live deliveries that would start failing. On an empty database (local, CI, a
-- preview branch) that made this migration impossible to apply, and it would
-- block production too wherever the seed rows survive.
--
-- They are cancelled rather than given a fee: they are not real deliveries, so
-- inventing what a rider earned for them is the same fiction this migration
-- refuses for real orders; and unassigning them would put fake jobs back in
-- front of real riders through dispatch. Scoped by the seed ids AND the seed's
-- own state, so a real order can never match.
update public.orders
   set status = 'cancelled'
 where id in ('ord_1002', 'ord_1003', 'ord_1004')
   and reference in ('#KFD-1002', '#KFD-1003', '#KFD-1004')
   and rider_payout is null
   and status in ('confirmed', 'preparing', 'out_for_delivery');

-- --------------------------------------------------------------------------
-- claim_order: rebuilt from 0043, plus 0050's guards
-- --------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- PREFLIGHT: refuse to install the null-payout guard until the backfill has run
-- ---------------------------------------------------------------------------
--
-- This migration makes rider_mark_delivered REFUSE a delivery whose
-- rider_payout is null, with 'This delivery has no agreed fee recorded'. That
-- is the right trade -- the old behaviour wrote coalesce(NULL, 0) into
-- rider_payouts, and unique (order_id) means that 0.00 row can never be
-- corrected. A blocked delivery an operator can unblock beats a wrong ledger
-- entry that is permanent.
--
-- But it is only safe if nothing is mid-delivery at the moment it lands. An
-- in-flight order with no frozen fee would start failing for a real rider, in
-- production, until someone noticed. Previously that ordering requirement lived
-- only in a comment, which is not a control.
--
-- So it is checked here. supabase db push now stops with the remediation
-- rather than installing a guard that breaks live deliveries.
--
-- Deliberately NOT auto-backfilled. Setting a historical fee at the current
-- rate invents a number, which is the same fiction 0038 refused:
-- "Deliveries already marked complete are not backfilled... Inventing one from
-- a historical rate would be the same fiction this migration exists to remove."
-- An operator decides what an old delivery was worth; this migration refuses to
-- guess on their behalf.
--
-- To clear this, look at the two lists and then run the repairs at the end of
-- this file:
--
--   select p.id, p.order_id, p.rider_id, p.earned_at
--     from rider_payouts p where p.amount = 0 order by p.earned_at;
--
--   select o.id, o.reference, o.rider_id, o.placed_at
--     from orders o
--    where o.rider_id is not null and o.rider_payout is null
--      and o.status in ('confirmed', 'preparing', 'out_for_delivery')
--    order by o.placed_at;
do $$
declare
  v_zero_ledger integer;
  v_inflight integer;
begin
  select count(*) into v_zero_ledger
    from public.rider_payouts p where p.amount = 0;

  select count(*) into v_inflight
    from public.orders o
   where o.rider_id is not null
     and o.rider_payout is null
     and o.status in ('confirmed', 'preparing', 'out_for_delivery');

  if v_zero_ledger > 0 or v_inflight > 0 then
    raise exception
      '0071 preflight: % ledger row(s) with a 0.00 amount and % in-flight order(s) with no frozen fee. rider_mark_delivered will refuse those deliveries until they are repaired. See the repair queries at the end of this migration.',
      v_zero_ledger, v_inflight
      using errcode = 'P0001';
  end if;
end;
$$;

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
     and r.archived_at is null
     and r.suspended_at is null;

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
         -- Frozen now, not read at payout time. RESTORED: 0050 dropped this
         -- line while rebuilding the body, and rider_mark_delivered has been
         -- writing coalesce(rider_payout, 0) ever since.
         rider_payout = public.rider_payout_per_delivery()
   where o.id = p_order_id
     and o.rider_id is null
     -- 'confirmed' only, matching admin_dispatch_order below: a rider is never
     -- offered an order the restaurant has not accepted, so a rider can never be
     -- left holding one that rider_mark_delivered would refuse to complete.
     and o.status = 'confirmed'
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

comment on function public.claim_order(text)
  is 'Claim an offered order, freezing rider_payout_per_delivery() onto it. Suspended and archived riders cannot claim. The order must be confirmed by the restaurant.';

revoke all on function public.claim_order(text) from public;
revoke all on function public.claim_order(text) from anon;
grant execute on function public.claim_order(text) to authenticated;

-- --------------------------------------------------------------------------
-- rider_mark_delivered: rebuilt from 0038, plus the suspension guard, a race-safe
-- status transition, and counters recomputed from the ledger
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
  -- Guard added: 0038 resolved the rider with no archived/suspended check, so a
  -- rider suspended while holding an order could still complete it and be paid.
  select r.id into v_rider_id
    from riders r
   where r.user_id = auth.uid()
     and r.archived_at is null
     and r.suspended_at is null;

  if v_rider_id is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;

  -- Read the order's assignee into its OWN variable. 0038 fixed this: it used to
  -- select into v_rider_id, overwriting the caller's id with the order's, so the
  -- ownership check compared the order's rider against itself and could never
  -- fail. Do not reintroduce it.
  select o.status, o.rider_id, o.rider_payout
    into v_status, v_order_rider_id, v_payout
    from orders o
   where o.id = p_order_id;

  if v_status is null then
    raise exception 'No order with id %.', p_order_id;
  end if;

  if v_order_rider_id is distinct from v_rider_id then
    raise exception 'That order is not assigned to you.' using errcode = '42501';
  end if;

  if v_status not in ('out_for_delivery', 'confirmed', 'preparing') then
    raise exception 'That order cannot be marked delivered from its current state (%).', v_status;
  end if;

  -- The status precondition now lives in the UPDATE, not only in the IF above.
  -- Two concurrent taps both read 'confirmed', both passed the IF, and both ran
  -- the increments below. With the guard here the loser updates zero rows and is
  -- told why, instead of double-counting.
  update orders
     set status = 'delivered'
   where id = p_order_id
     -- Cast required. `array['a','b']` is text[], and orders.status is the
     -- order_status enum, so without this Postgres reports
     -- "operator does not exist: order_status = text" (42883) and the whole
     -- function raises -- for every delivery, not just an odd status.
     and status = any (array['out_for_delivery', 'confirmed', 'preparing']::order_status[]);

  if not found then
    raise exception 'That order is no longer yours to complete.' using errcode = 'P0001';
  end if;

  -- A NULL payout here means the claim predates the freeze being restored. It
  -- used to be silently recorded as a real 0.00 payout, which is unrecoverable
  -- because of unique (order_id). Refusing is better than a permanent zero: the
  -- rider is not paid a peso they earned, and the operator sees why.
  if v_payout is null then
    raise exception 'This delivery has no agreed fee recorded. Ask an admin to fix it.'
      using errcode = 'P0001';
  end if;

  -- The ledger row is the record. on conflict do nothing keeps a retry from
  -- raising instead of quietly double-paying.
  insert into rider_payouts (rider_id, order_id, amount)
  values (v_rider_id, p_order_id, v_payout)
  on conflict (order_id) do nothing;

  -- RECOMPUTE, do not increment. riders.deliveries and riders.earnings are
  -- denormalised copies of the ledger; adding to them meant any later deletion
  -- (on delete cascade from orders) left them permanently wrong with nothing to
  -- reconcile. Recomputing is idempotent, so it is also immune to the double-tap
  -- race above.
  update riders r
     set deliveries = (select count(*)::int from rider_payouts p where p.rider_id = v_rider_id),
         earnings = coalesce((select sum(p.amount) from rider_payouts p where p.rider_id = v_rider_id), 0)
   where r.id = v_rider_id;
end;
$$;

comment on function public.rider_mark_delivered(text)
  is 'Complete an assigned order and record the frozen payout in the ledger. Suspended/archived riders refused; the status transition is race-safe; riders.deliveries and earnings are recomputed from the ledger, not incremented.';

revoke all on function public.rider_mark_delivered(text) from public;
revoke all on function public.rider_mark_delivered(text) from anon;
grant execute on function public.rider_mark_delivered(text) to authenticated;

-- --------------------------------------------------------------------------
-- rider_report_failed_delivery: rebuilt from 0044, plus the suspension guard
-- --------------------------------------------------------------------------
create or replace function public.rider_report_failed_delivery(
  p_order_id text,
  p_reason text
)
returns table (
  order_id text,
  reference text,
  status order_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider_id text;
  v_status order_status;
  v_order_rider_id text;
begin
  -- Guard added: 0044 checked archived_at but not suspended_at.
  select r.id into v_rider_id
    from riders r
   where r.user_id = auth.uid()
     and r.archived_at is null
     and r.suspended_at is null;

  if v_rider_id is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;

  select o.status, o.rider_id
    into v_status, v_order_rider_id
    from orders o
   where o.id = p_order_id;

  if v_status is null then
    raise exception 'No order with id %.', p_order_id;
  end if;

  if v_order_rider_id is distinct from v_rider_id then
    raise exception 'That order is not assigned to you.' using errcode = '42501';
  end if;

  if v_status not in ('out_for_delivery', 'confirmed', 'preparing') then
    raise exception 'That order cannot be failed from its current state (%).', v_status;
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Say why the delivery could not be completed.' using errcode = '22023';
  end if;

  update orders
     set rider_id = null,
         rider = null,
         -- The fee belonged to the rider who failed it. Leaving it set would
         -- advertise a payout to whoever claims the order next.
         rider_payout = null,
         status = 'confirmed',
         -- Kept from 0044 verbatim. These three columns are the accountability
         -- record for a bounced delivery and they survive reassignment on
         -- purpose, so they must not be dropped in a rebuild.
         delivery_failed_reason = left(btrim(p_reason), 500),
         delivery_failed_at = now(),
         delivery_failed_by = v_rider_id
   where id = p_order_id;

  return query
    select o.id, o.reference, o.status
      from orders o
     where o.id = p_order_id;
end;
$$;

comment on function public.rider_report_failed_delivery(text, text)
  is 'Return an undeliverable order to the pool with a recorded reason. Suspended and archived riders refused.';

revoke all on function public.rider_report_failed_delivery(text, text) from public;
revoke all on function public.rider_report_failed_delivery(text, text) from anon;
grant execute on function public.rider_report_failed_delivery(text, text) to authenticated;

-- --------------------------------------------------------------------------
-- rider_set_status: a suspended or archived rider must not be able to declare
-- themselves available. 0018 checked only that a rider row existed.
-- --------------------------------------------------------------------------
create or replace function public.rider_set_status(p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('online', 'busy', 'offline') then
    raise exception 'Status must be online, busy or offline.';
  end if;

  if not exists (
    select 1 from riders
     where user_id = auth.uid()
       and archived_at is null
       and suspended_at is null
  ) then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;

  update riders
     set status = p_status::public.rider_status
   where user_id = auth.uid();
end;
$$;

comment on function public.rider_set_status(text)
  is 'Set the calling rider''s own availability. Refused while suspended or archived, so the roster cannot show a blocked rider as available.';

revoke all on function public.rider_set_status(text) from public;
revoke all on function public.rider_set_status(text) from anon;
grant execute on function public.rider_set_status(text) to authenticated;

-- --------------------------------------------------------------------------
-- Repair what the missing freeze already did.
--
-- NOT RUN. Read it, then run it yourself if you agree.
--
-- Two things are wrong in existing data and they are different kinds of wrong:
--
--   a) Ledger rows written as 0.00. These are real completed deliveries that the
--      rider earned the standard rate for. They can be repaired, but only by an
--      operator: money rows are the audit record, and an automated rewrite of
--      every 0.00 payout is a decision about someone's pay that should not be
--      made by a migration.
--
--   b) Orders claimed while the freeze was missing. These have rider_payout NULL
--      and no ledger row yet, so rider_mark_delivered now refuses them until an
--      admin fills the fee in. Backfill those from the current rate, which is
--      what the rider was promised when they accepted.
--
-- Inspect first:
--
--   select p.id, p.order_id, p.rider_id, p.earned_at
--     from rider_payouts p where p.amount = 0 order by p.earned_at;
--
--   select o.id, o.reference, o.rider_id, o.placed_at
--     from orders o
--    where o.rider_id is not null and o.rider_payout is null
--      and o.status in ('confirmed', 'preparing', 'out_for_delivery')
--    order by o.placed_at;
--
-- Once you have looked at those lists:
--
--   update rider_payouts p set amount = public.rider_payout_per_delivery()
--    where p.amount = 0;
--
--   update orders o set rider_payout = public.rider_payout_per_delivery()
--    where o.rider_payout is null
--      and o.rider_id is not null
--      and o.status in ('confirmed', 'preparing', 'out_for_delivery');
--
--   -- bring the denormalised counters back in line with the ledger
--   update riders r
--      set deliveries = (select count(*)::int from rider_payouts p where p.rider_id = r.id),
--          earnings = coalesce((select sum(p.amount) from rider_payouts p where p.rider_id = r.id), 0);
-- --------------------------------------------------------------------------
-- --------------------------------------------------------------------------
-- Dispatch requires merchant acceptance
--
-- admin_dispatch_order and dispatch_unassigned_orders both matched
-- status in ('pending', 'confirmed'). 'pending' means the restaurant has not
-- yet decided: merchant-queries.allowedTransitions makes a merchant move it to
-- 'confirmed' (Accept) or 'cancelled' (Reject). So the platform was dispatching
-- riders to collect food that might be rejected a minute later, and claim_order
-- would happily hand them a pending order that rider_mark_delivered then
-- refused -- the dead end SKILL.md:226-239 documents.
--
-- Restricting dispatch to 'confirmed' fixes both ends at once: a rider is only
-- ever offered work the restaurant has agreed to make, and every order a rider
-- can claim is one they are allowed to complete.
--
-- The unassigned list uses the same filter, so an order awaiting the merchant
-- disappears from the dispatch board -- which is correct, since there is
-- nothing to dispatch -- but it also means a pending order is invisible there.
-- That is stated in the page copy in the same commit that adopts it.
--
-- Bodies copied from 0050_rider_suspension.sql; only the status filter changes.
-- --------------------------------------------------------------------------
create or replace function public.admin_dispatch_order(
  p_order_id text,
  p_rider_ids text[] default null
)
returns table (order_id text, offered_to integer)
language plpgsql
security definer
set search_path = public
as $$
-- Required, and required as the first line inside the block (0041).
-- Returns TABLE(order_id text, ...), so `order_id` in the body is a PL/pgSQL
-- variable while order_offers also has an order_id column, and the ON CONFLICT
-- inference clause cannot tell them apart: ERROR 42702, column reference
-- "order_id" is ambiguous. Qualifying does not help -- Postgres rejects
-- `on conflict (o.order_id, ...)` with a syntax error.
--
-- This directive was lost when the body was rebuilt from an older copy. It is
-- not cosmetic: admin_dispatch_order is the only writer of order_offers, and
-- claim_order refuses any order the rider was never offered, so with dispatch
-- raising 42702 no rider can ever claim anything.
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
     -- 'confirmed' only: the restaurant has accepted.
     and o.status = 'confirmed';

  if v_city is null then
    raise exception 'That order is not available for dispatch. It may already have a rider, or the restaurant has not accepted it yet.' using errcode = '22023';
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
     and d.suspended_at is null
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

create or replace function public.dispatch_unassigned_orders()
returns table (
  order_id text,
  reference text,
  customer text,
  restaurant text,
  restaurant_id text,
  city text,
  delivery_address text,
  items jsonb,
  total numeric,
  status order_status,
  placed_at timestamptz,
  live_offers integer,
  offers_made integer,
  declines integer,
  online_riders_in_city integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.reference,
    o.customer,
    o.restaurant,
    o.restaurant_id,
    r.city,
    o.delivery_address,
    o.items,
    o.total,
    o.status,
    o.placed_at,
    (select count(*)::int from order_offers f
      where f.order_id = o.id and f.status = 'offered' and f.expires_at > now()),
    (select count(*)::int from order_offers f where f.order_id = o.id),
    (select count(*)::int from order_offers f
      where f.order_id = o.id and f.status = 'declined'),
    (select count(*)::int from riders d
      where d.city = r.city
        and d.status = 'online'
        and d.archived_at is null
        and d.suspended_at is null)
  from orders o
  join restaurants r on r.id = o.restaurant_id
  where o.rider_id is null
    -- 'confirmed' only, matching admin_dispatch_order: nothing to dispatch
    -- until the restaurant has accepted.
    and o.status = 'confirmed'
  order by o.placed_at;
end;
$$;

comment on function public.dispatch_unassigned_orders()
  is 'Orders a dispatcher can act on: unassigned AND accepted by the restaurant. Pending orders are excluded until a merchant accepts them.';

revoke all on function public.dispatch_unassigned_orders() from public;
revoke all on function public.dispatch_unassigned_orders() from anon;
grant execute on function public.dispatch_unassigned_orders() to authenticated;

-- --------------------------------------------------------------------------
-- rider_mark_picked_up: the missing out_for_delivery transition
--
-- `out_for_delivery` was an enum value and a status every read path understood,
-- and nothing in the running app could ever set it. It was not a cosmetic gap:
--   * the rider card's own state machine skipped the step, so "collected the
--     food" and "still waiting at the restaurant" were the same screen;
--   * a rider could sit in a restaurant queue with no signal that they had it;
--   * the customer's tracker could never show "on the way", because it polls
--     this column.
--
-- Driven by the RIDER rather than the merchant, because the existing decision
-- (merchant-queries.ts:90-93) is that the out_for_delivery -> delivered leg is
-- dispatch's job, not the restaurant's. The moment the rider physically has the
-- food is a fact only the rider knows, and it is the same fact the customer is
-- waiting on.
--
-- Guarded the same way rider_mark_delivered is: ownership, an explicit state
-- list, and the precondition inside the UPDATE so a double tap cannot move the
-- order twice.
-- --------------------------------------------------------------------------
create or replace function public.rider_mark_picked_up(p_order_id text)
returns table (order_id text, reference text, status order_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider_id text;
  v_status order_status;
  v_order_rider_id text;
begin
  select r.id into v_rider_id
    from riders r
   where r.user_id = auth.uid()
     and r.archived_at is null
     and r.suspended_at is null;

  if v_rider_id is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;

  select o.status, o.rider_id into v_status, v_order_rider_id
    from orders o
   where o.id = p_order_id;

  if v_status is null then
    raise exception 'No order with id %.', p_order_id;
  end if;

  if v_order_rider_id is distinct from v_rider_id then
    raise exception 'That order is not assigned to you.' using errcode = '42501';
  end if;

  -- Already on the way is not an error worth a second round trip; the rider
  -- tapping twice is told the order is out for delivery and nothing changes.
  if v_status = 'out_for_delivery' then
    return query
      select o.id, o.reference, o.status from orders o where o.id = p_order_id;
    return;
  end if;

  if v_status not in ('confirmed', 'preparing') then
    raise exception 'That order cannot be picked up from its current state (%).', v_status;
  end if;

  update orders
     set status = 'out_for_delivery'
   where id = p_order_id
     -- Same cast as above; enum compared against a text[] otherwise.
     and status = any (array['confirmed', 'preparing']::order_status[]);

  if not found then
    raise exception 'That order is no longer yours to run.' using errcode = 'P0001';
  end if;

  return query
    select o.id, o.reference, o.status from orders o where o.id = p_order_id;
end;
$$;

comment on function public.rider_mark_picked_up(text)
  is 'Rider confirms they have collected the food, moving the order to out_for_delivery. This is the transition the status enum always had and nothing could set. Riders only, their own order only.';

revoke all on function public.rider_mark_picked_up(text) from public;
revoke all on function public.rider_mark_picked_up(text) from anon;
grant execute on function public.rider_mark_picked_up(text) to authenticated;
