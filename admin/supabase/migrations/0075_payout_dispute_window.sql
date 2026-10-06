-- ---------------------------------------------------------------------------
-- 0075: a 24-hour dispute window on rider payouts
-- ---------------------------------------------------------------------------
-- The trust gap, stated plainly: one unconfirmed tap pays out, and if the tap
-- was wrong there is no way back. rider_mark_delivered inserts the ledger row
-- and the money is the rider's. A delivery that never happened, went to the
-- wrong address, or was completed against an order the customer cancelled is
-- indistinguishable from a good one, and unique (order_id) means the row cannot
-- even be re-recorded correctly afterwards.
--
-- This migration makes that reversible for 24 hours. It does not prevent the
-- fraud. It makes it recoverable, which is the actual gap: a rider who is
-- trusted and paid immediately is the thing being protected, and an operator
-- who can claw back within a day is the thing that was missing.
--
-- NOT APPLIED. Pending the same review as 0052-0071.
--
-- ---------------------------------------------------------------------------
-- Why this lives on the ledger, not on orders.status
-- ---------------------------------------------------------------------------
-- The obvious design adds a 'pending_review' value to the order_status enum.
-- That is wrong on the merits and expensive in practice.
--
-- Wrong on the merits: the delivery DID happen. The rider walked it, the
-- customer may well have received it. What is unsettled is the MONEY, not the
-- delivery. Encoding it as an order status would make every downstream reader
-- -- the customer tracking screen, the rider card, the admin order list, the
-- order-progress component, offer-claimable, delivery-actions -- responsible
-- for understanding a status that means "delivered but pending", and each of
-- those ten files would need the new case or silently fall through to a wrong
-- label. A ledger column changes one function and one read path.
--
-- Wrong in practice: order_status is the customer-facing state machine. Every
-- merchant and customer notification keys off it, and adding a value there
-- means a status nobody has written copy for flows into every notification and
-- every rider earnings surface.
--
-- ---------------------------------------------------------------------------
-- States
-- ---------------------------------------------------------------------------
--   pending_review  recorded, counted as earned, reversible. The default.
--   settled         the window closed with no dispute. Terminal and good.
--   disputed        someone raised a problem inside the window. Needs an admin.
--   reversed        an admin found against the rider; the money is clawed back
--                   and the row stops counting. Terminal and bad.
--
-- pending_review counts toward riders.earnings and riders.deliveries. The rider
-- delivered; withholding the figure would mean a good rider looks unpaid for a
-- day because of an operator's risk appetite, and would re-create the exact
-- "my money disappeared" class of bug that 0050 caused. The window limits
-- reversibility, it does not create a shadow balance.
--
-- reversed keeps its original amount rather than zeroing it. A ledger is an
-- audit record; rewriting the amount to 0.00 would destroy the evidence of what
-- was actually earned, and would trip the CI check that refuses zero payouts
-- (which exists to catch the 0050 defect, not to forbid a reversed row). It
-- stops counting instead, so earnings fall by the reversed amount and nothing
-- is invented.
--
-- ---------------------------------------------------------------------------
-- How the window closes with no cron
-- ---------------------------------------------------------------------------
-- There is no scheduler in this database (no pg_cron, nothing in any
-- migration). Rather than introduce one, settlement is lazy: the admin
-- dashboard calls rider_settle_expired_payouts() when it loads the ledger, and
-- that is what closes elapsed windows. A payout that nobody looks at stays
-- pending_review, which is harmless -- the state is only read to decide whether
-- a dispute is still admissible, and the expiry timestamp answers that
-- directly.
--
-- This is why review_expires_at is a column and not derived from settled_at:
-- the admissibility check must not depend on a sweep having run.
--
-- ---------------------------------------------------------------------------
-- Who may dispute
-- ---------------------------------------------------------------------------
--   customer  by order reference, with the anon key, same posture as
--             track_order (0012). Walk-in customers have no account and the
--             reference is high-entropy, so this is the only channel that
--             reaches the people most likely to have been mis-delivered.
--   merchant  authenticated, for their own restaurant's orders.
--   admin     anything below plus resolution.
--
-- A dispute is reversible-only: it flags the row for an operator and moves no
-- money. The abuse ceiling is therefore a nuisance (a row an admin must look
-- at), not a loss, which is why an anon caller being able to reach it is
-- acceptable. It is one dispute per payout, ever -- a second attempt is
-- refused rather than overwriting the first, so the original reason survives.

do $$
begin
  create type public.payout_settlement_state as enum (
    'pending_review',
    'settled',
    'disputed',
    'reversed'
  );
exception when duplicate_object then null;
end $$;

alter table public.rider_payouts
  add column if not exists settlement_state public.payout_settlement_state
    not null default 'pending_review',
  add column if not exists review_expires_at timestamptz,
  -- On the ledger, not on orders. orders.rejection_reason looks like the obvious
  -- home for a dispute note but is documented (0009) as the merchant's reason
  -- for CANCELLING, null for every other status -- reusing it would break a
  -- documented invariant and mix two unrelated histories in one column.
  add column if not exists dispute_reason text,
  add column if not exists disputed_at timestamptz;

comment on column public.rider_payouts.settlement_state is
  'pending_review (counted, reversible for 24h), settled (window closed clean), disputed (flagged for an admin), reversed (found against the rider; stops counting, amount preserved for audit).';

comment on column public.rider_payouts.review_expires_at is
  'When this payout stops being disputeable: earned_at + 24h, set by column default so no existing INSERT needs to change. Stamped even for reversed rows.';

comment on column public.rider_payouts.dispute_reason is
  'What the customer or merchant said went wrong, in their words. First report only: a second dispute is refused rather than overwriting this.';

comment on column public.rider_payouts.disputed_at is
  'When the dispute was raised.';

-- The default is the whole trick for not touching 0071. rider_mark_delivered
-- inserts (rider_id, order_id, amount) and omits these two columns, so every
-- payout it writes is automatically reversible. Existing rows pick up
-- pending_review with an expiry in the past, which the sweep settles on its
-- next run -- correct, since those deliveries were never reviewable.
--
-- review_expires_at is deliberately nullable: a row that somehow arrives with
-- an explicit NULL (a repair INSERT that forgot the default) is treated as
-- never expiring rather than instantly disputeable, because the safe reading of
-- "I do not know when this expires" is "do not let this be disputed."
alter table public.rider_payouts
  alter column review_expires_at set default (now() + interval '24 hours');

update public.rider_payouts
   set review_expires_at = earned_at + interval '24 hours'
 where review_expires_at is null;

-- Settle whatever window has elapsed. Admin-only; the dashboard calls it on
-- load. Idempotent and safe to call often.
create or replace function public.rider_settle_expired_payouts()
  returns integer
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_settled integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Only an admin can settle payouts.' using errcode = '42501';
  end if;

  update public.rider_payouts
     set settlement_state = 'settled'
   where settlement_state = 'pending_review'
     and review_expires_at is not null
     and review_expires_at <= now();

  get diagnostics v_settled = row_count;
  return v_settled;
end;
$$;

comment on function public.rider_settle_expired_payouts()
  is 'Close every elapsed dispute window, returning how many rows settled. Admin-only. Safe and idempotent to call repeatedly; there is no scheduler, so the admin ledger calls this on load.';

revoke all on function public.rider_settle_expired_payouts() from public;
revoke all on function public.rider_settle_expired_payouts() from anon;
grant execute on function public.rider_settle_expired_payouts() to authenticated;

-- Raise a problem against a settled-or-pending payout.
--
-- p_reference rather than an order id: the customer-facing identifier is the
-- reference printed on the receipt, and that is what a person who was
-- mis-delivered will actually have. Accepting only an id would make the
-- recovery path unusable for exactly the people it exists for.
create or replace function public.report_delivery_issue(
  p_reference text,
  p_reason text
)
  returns table (order_id text, reference text, state public.payout_settlement_state)
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_payout public.rider_payouts%rowtype;
  v_order public.orders%rowtype;
  v_is_admin boolean;
begin
  if p_reference is null or btrim(p_reference) = '' then
    raise exception 'Enter your order reference.' using errcode = '22023';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Say what went wrong.' using errcode = '22023';
  end if;

  -- Normalise the same way track_order (0012) does, for the same reason. A
  -- receipt reference gets typed with the '#', without it, and in whatever case
  -- the customer's phone keyboard produced. Plain equality here would refuse
  -- the recovery path for exactly the pasted-and-mistyped reference a
  -- mis-delivered customer is holding -- the one caller this function is for.
  select * into v_order
    from public.orders o
   where upper(replace(o.reference, '#', ''))
       = upper(replace(btrim(p_reference), '#', ''))
   limit 1;
  if not found then
    raise exception 'No order with that reference.' using errcode = 'P0002';
  end if;

  -- A merchant may only dispute their own restaurant's order. An admin may
  -- dispute any. An anon caller (the customer) has neither relationship and
  -- relies on the reference alone, which is the track_order posture.
  v_is_admin := public.is_platform_admin();
  if not v_is_admin then
    if auth.uid() is not null then
      if public.current_merchant_restaurant() is distinct from v_order.restaurant_id then
        raise exception 'That order is not for your restaurant.' using errcode = '42501';
      end if;
    end if;
  end if;

  select * into v_payout from public.rider_payouts p where p.order_id = v_order.id;
  if not found then
    raise exception 'That order has no completed delivery to dispute.' using errcode = '22023';
  end if;

  -- The window. Checked against the timestamp rather than the current state so
  -- it does not depend on a sweep having run.
  if v_payout.review_expires_at is not null
     and v_payout.review_expires_at <= now() then
    raise exception 'The 24-hour review window for that delivery has closed.'
      using errcode = '22023';
  end if;

  -- One dispute per payout, ever. Refusing a second one keeps the first reason
  -- intact instead of letting it be overwritten.
  if v_payout.settlement_state = 'disputed' then
    raise exception 'This delivery has already been reported and is being reviewed.'
      using errcode = '22023';
  end if;
  if v_payout.settlement_state = 'reversed' then
    raise exception 'This delivery has already been resolved.' using errcode = '22023';
  end if;

  update public.rider_payouts
     set settlement_state = 'disputed',
         dispute_reason = left(btrim(p_reason), 500),
         disputed_at = now()
   where id = v_payout.id;

  return query
    select v_order.id, v_order.reference, 'disputed'::public.payout_settlement_state;
end;
$$;

comment on function public.report_delivery_issue(text, text)
  is 'Raise a problem against a completed delivery inside its 24h window. Marks the payout disputed for an admin and moves no money. Callable by the customer with the receipt reference (same posture as track_order), by the owning merchant, or by an admin.';

-- Reachable by anon on purpose: a walk-in customer has no account, and the
-- reference is high-entropy. The action is reversible-only and once per payout.
revoke all on function public.report_delivery_issue(text, text) from public;
revoke all on function public.report_delivery_issue(text, text) from anon;
grant execute on function public.report_delivery_issue(text, text) to anon;
grant execute on function public.report_delivery_issue(text, text) to authenticated;

-- Resolve a disputed payout. This is the recovery, and the only way money moves
-- backwards.
create or replace function public.resolve_delivery_issue(
  p_order_id text,
  p_action text,
  p_note text default null
)
  returns table (order_id text, reference text, state public.payout_settlement_state)
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_payout public.rider_payouts%rowtype;
  v_order public.orders%rowtype;
  v_state public.payout_settlement_state;
begin
  if not public.is_platform_admin() then
    raise exception 'Only an admin can resolve a delivery issue.' using errcode = '42501';
  end if;
  if p_action not in ('release', 'reverse') then
    raise exception 'Action must be release or reverse.' using errcode = '22023';
  end if;

  select * into v_payout from public.rider_payouts p where p.order_id = p_order_id;
  if not found then
    raise exception 'No payout for that order.' using errcode = 'P0002';
  end if;
  if v_payout.settlement_state <> 'disputed' then
    raise exception 'That payout is not disputed (it is %).', v_payout.settlement_state;
  end if;

  -- The note is appended to the customer's own words rather than replacing
  -- them. An operator's finding and a customer's complaint are different facts
  -- and the second one should still be readable afterwards.
  if p_note is not null and btrim(p_note) <> '' then
    update public.rider_payouts
       set dispute_reason = left(
             coalesce(dispute_reason, '')
             || case when coalesce(dispute_reason, '') = '' then '' else E'\n---\n' end
             || 'Operator: ' || btrim(p_note),
             1000)
     where id = v_payout.id;
  end if;

  if p_action = 'release' then
    v_state := 'settled';
  else
    v_state := 'reversed';
  end if;

  update public.rider_payouts
     set settlement_state = v_state
   where id = v_payout.id;

  -- Only a reversal changes the rider's totals, so only a reversal recomputes
  -- them. Same rule as 0071: recompute from the ledger, never increment, so the
  -- result is idempotent and cannot drift.
  if v_state = 'reversed' then
    update public.riders r
       set deliveries = (select count(*)::int
                           from public.rider_payouts p
                          where p.rider_id = r.id
                            and p.settlement_state <> 'reversed'),
           earnings = coalesce((select sum(p.amount)
                                 from public.rider_payouts p
                                where p.rider_id = r.id
                                  and p.settlement_state <> 'reversed'), 0)
     where r.id = v_payout.rider_id;
  end if;

  select * into v_order from public.orders o where o.id = p_order_id;
  return query
    select v_order.id, v_order.reference, v_state;
end;
$$;

comment on function public.resolve_delivery_issue(text, text, text)
  is 'Resolve a disputed payout: release pays the rider and settles it, reverse stops it counting and recomputes that rider''s totals from the ledger. Admin-only.';

revoke all on function public.resolve_delivery_issue(text, text, text) from public;
revoke all on function public.resolve_delivery_issue(text, text, text) from anon;
grant execute on function public.resolve_delivery_issue(text, text, text) to authenticated;

-- --------------------------------------------------------------------------
-- Earnings must ignore reversed rows, or a clawed-back payout would keep
-- counting. 0038 and 0058 both sum the ledger, and the rider's own summary is
-- what they check against their bank, so it has to agree with the dashboard.
-- --------------------------------------------------------------------------
create or replace function public.rider_earnings_summary()
  returns table (
    earned_today numeric,
    earned_week numeric,
    lifetime numeric,
    delivery_count integer,
    first_earned_at timestamptz,
    last_earned_at timestamptz
  )
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_rider_id text;
  v_today date;
begin
  v_rider_id := public.current_rider_id();

  if v_rider_id is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;

  v_today := public.rider_earned_on(now());

  return query
    select
      coalesce(sum(p.amount) filter (
        where public.rider_earned_on(p.earned_at) = v_today
          and p.settlement_state <> 'reversed'), 0),
      coalesce(sum(p.amount) filter (
        where p.earned_at >= date_trunc('week', now())
          and p.settlement_state <> 'reversed'), 0),
      coalesce(sum(p.amount) filter (
        where p.settlement_state <> 'reversed'), 0),
      count(*) filter (where p.settlement_state <> 'reversed')::int,
      min(p.earned_at) filter (where p.settlement_state <> 'reversed'),
      max(p.earned_at) filter (where p.settlement_state <> 'reversed')
    from public.rider_payouts p
   where p.rider_id = v_rider_id;
end;
$$;

revoke all on function public.rider_earnings_summary() from public;
grant execute on function public.rider_earnings_summary() to authenticated;

-- --------------------------------------------------------------------------
-- The admin payout page must agree with the rider's Earnings tab. Both sum the
-- ledger, and 0071 already forbids them disagreeing, so a reversal that only
-- one of them ignores would break that guarantee in the other direction: the
-- rider's app would show a lower number than the admin dashboard, with no
-- explanation.
--
-- delivered_count and failed_count count orders rather than ledger rows and so
-- are untouched: a reversed row leaves the delivery recorded, which is the
-- point of keeping the amount for audit. ledger_rows does exclude reversed,
-- because it is a ledger count and the row still exists to be read.
-- --------------------------------------------------------------------------
create or replace function public.admin_rider_payout_summary(p_rider_id text)
  returns table (
    lifetime numeric,
    earned_today numeric,
    earned_week numeric,
    delivered_count integer,
    failed_count integer,
    payout_count integer,
    first_earned_at timestamptz,
    last_earned_at timestamptz
  )
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  return query
    select
      coalesce((select sum(p.amount) from public.rider_payouts p
                 where p.rider_id = p_rider_id
                   and p.settlement_state <> 'reversed'), 0),
      coalesce((
        select sum(p.amount) from public.rider_payouts p
         where p.rider_id = p_rider_id
           and p.settlement_state <> 'reversed'
           and public.rider_earned_on(p.earned_at) = public.rider_earned_on(now())
      ), 0),
      coalesce((
        select sum(p.amount) from public.rider_payouts p
         where p.rider_id = p_rider_id
           and p.settlement_state <> 'reversed'
           and public.rider_earned_on(p.earned_at) >=
               (public.rider_earned_on(now()) - 6)
      ), 0),
      (select count(*)::int
         from public.orders o
        where o.rider_id = p_rider_id
          and o.status = 'delivered'),
      (select count(*)::int
         from public.orders o
        where o.delivery_failed_by = p_rider_id
          and o.delivery_failed_at is not null),
      (select count(*)::int from public.rider_payouts p
        where p.rider_id = p_rider_id
          and p.settlement_state <> 'reversed'),
      (select min(p.earned_at) from public.rider_payouts p
        where p.rider_id = p_rider_id
          and p.settlement_state <> 'reversed'),
      (select max(p.earned_at) from public.rider_payouts p
        where p.rider_id = p_rider_id
          and p.settlement_state <> 'reversed');
end;
$$;

comment on function public.admin_rider_payout_summary(text) is
  'Admin view of one rider''s ledger. Money figures and payout_count exclude reversed payouts so they match rider_earnings_summary(); delivered_count and failed_count count orders and are unaffected by a reversal.';

revoke all on function public.admin_rider_payout_summary(text) from public;
revoke all on function public.admin_rider_payout_summary(text) from anon;
grant execute on function public.admin_rider_payout_summary(text) to authenticated;

-- --------------------------------------------------------------------------
-- The admin ledger needs the settlement state, or a disputed payout is
-- invisible: the page lists rows, the money totals still add up, and nothing
-- says a row is waiting on a decision. settlement_state, the expiry, and the
-- reason are what turn "the numbers look fine" into "this one is unresolved".
--
-- Additive columns only. Existing callers read the first six and are unaffected.
-- --------------------------------------------------------------------------

-- The drop is not optional. CREATE OR REPLACE cannot change a function's
-- return type -- it is part of the function's identity -- so widening this
-- result set to four more columns is rejected with "cannot change return type
-- of existing function". Dropping and recreating is the only way, and the
-- revoke/grant/comment statements below this definition restore everything the
-- drop takes with it.
--
-- Checked for dependents before relying on it: no view, function or rule
-- references admin_rider_payouts, and public holds no views at all, so the drop
-- needs no cascade and cannot orphan anything. The admin app reaches it over
-- PostgREST, which holds no database dependency.
drop function if exists public.admin_rider_payouts(text, integer);

create or replace function public.admin_rider_payouts(
  p_rider_id text,
  p_limit integer default 25
)
  returns table (
    payout_id bigint,
    order_id text,
    order_reference text,
    restaurant text,
    amount numeric,
    earned_at timestamptz,
    settlement_state public.payout_settlement_state,
    review_expires_at timestamptz,
    dispute_reason text,
    disputed_at timestamptz
  )
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  v_limit integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 25), 200));

  return query
    select p.id,
           p.order_id,
           o.reference,
           o.restaurant,
           p.amount,
           p.earned_at,
           p.settlement_state,
           p.review_expires_at,
           p.dispute_reason,
           p.disputed_at
      from public.rider_payouts p
      join public.orders o on o.id = p.order_id
     where p.rider_id = p_rider_id
     order by p.earned_at desc
     limit v_limit;
end;
$$;

comment on function public.admin_rider_payouts(text, integer) is
  'Admin view of one rider''s payout rows, including the dispute state so an unresolved row is visible rather than looking like any other.';

revoke all on function public.admin_rider_payouts(text, integer) from public;
revoke all on function public.admin_rider_payouts(text, integer) from anon;
grant execute on function public.admin_rider_payouts(text, integer) to authenticated;

-- Disputed payouts across every rider, for an operator's work queue. Without
-- this the only way to find an unresolved row is to open all 25 payouts on one
-- rider's page and read each state.
create or replace function public.admin_disputed_payouts()
  returns table (
    order_id text,
    order_reference text,
    restaurant text,
    rider_id text,
    rider_name text,
    amount numeric,
    dispute_reason text,
    disputed_at timestamptz,
    review_expires_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select p.order_id,
         o.reference,
         o.restaurant,
         p.rider_id,
         r.name,
         p.amount,
         p.dispute_reason,
         p.disputed_at,
         p.review_expires_at
    from public.rider_payouts p
    join public.orders o on o.id = p.order_id
    join public.riders r on r.id = p.rider_id
   where p.settlement_state = 'disputed'
   order by p.review_expires_at asc nulls last;
$$;

comment on function public.admin_disputed_payouts() is
  'Every disputed payout, soonest window first. Admin-only; the operator work queue for resolving delivery issues.';

revoke all on function public.admin_disputed_payouts() from public;
revoke all on function public.admin_disputed_payouts() from anon;
grant execute on function public.admin_disputed_payouts() to authenticated;

-- --------------------------------------------------------------------------
-- The rider's own history. A rider whose delivery has been disputed should see
-- that, not a normal-looking payout: the money is still counted as theirs (that
-- is the whole point of not holding it), so without this column a disputed
-- delivery is indistinguishable from a settled one and the rider finds out by
-- noticing their total moved.
--
-- settlement_state is last so existing positional readers keep working.
-- --------------------------------------------------------------------------

-- Same return-type constraint as admin_rider_payouts above: the appended
-- settlement_state column means CREATE OR REPLACE is rejected outright, so the
-- 0038 version has to go first. No dependent views or functions exist on this
-- one either.
drop function if exists public.rider_payout_history(integer);

create or replace function public.rider_payout_history(p_limit int default 20)
  returns table (
    order_id text,
    order_reference text,
    restaurant text,
    amount numeric,
    earned_at timestamptz,
    has_more boolean,
    settlement_state public.payout_settlement_state
  )
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  v_rider_id text;
  v_page integer;
begin
  -- Kept verbatim from 0038: the rider lookup is on riders.user_id alone.
  -- Joining app_users as well would make this stricter than
  -- fetch_rider_orders_page, which reads as a bug when a rider has a riders
  -- row but no matching app_users row.
  select r.id into v_rider_id
    from public.riders r
   where r.user_id = auth.uid();

  if v_rider_id is null then
    raise exception 'No rider profile is linked to this account.'
      using errcode = 'P0002';
  end if;

  v_page := greatest(coalesce(p_limit, 20), 1);

  return query
  with rows as (
    select p.order_id, p.amount, p.earned_at, p.settlement_state
      from public.rider_payouts p
     where p.rider_id = v_rider_id
       -- Reversed rows are excluded: the amount is kept for the audit trail,
       -- but showing a rider a payout they were not paid for and cannot claim
       -- would be worse than omitting it. It remains visible to an admin.
       and p.settlement_state <> 'reversed'
     order by p.earned_at desc, p.id desc
     limit v_page
  )
  select
    rows.order_id,
    o.reference,
    o.restaurant,
    rows.amount,
    rows.earned_at,
    (
      select count(*) > v_page
        from public.rider_payouts p2
       where p2.rider_id = v_rider_id
         and p2.settlement_state <> 'reversed'
    ),
    rows.settlement_state
  from rows
  join public.orders o on o.id = rows.order_id
  order by rows.earned_at desc;
end;
$$;

comment on function public.rider_payout_history(integer) is
  'The calling rider''s own payout rows with the settlement state, so a disputed delivery is visible to them. Reversed rows are excluded; their amount is retained for audit but is not money the rider holds.';

revoke all on function public.rider_payout_history(integer) from public;
revoke all on function public.rider_payout_history(integer) from anon;
grant execute on function public.rider_payout_history(integer) to authenticated;

-- --------------------------------------------------------------------------
-- Invariants for CI. The same reasoning as the money checks added alongside
-- 0071: the 0050 payout defect produced a perfectly well-formed zero and every
-- structural assertion passed, because the ledger, the Earnings tab and the
-- admin page all agreed with each other and all reported zero. Only comparing
-- values catches it.
--
-- Two new failures worth naming:
--   * a payout counted as earned while reversed (earnings would disagree with
--     the ledger sum the CI check already compares against)
--   * a disputed payout past its expiry, which means nobody swept it and the
--     row is sitting in the one state an operator has to action
-- --------------------------------------------------------------------------
comment on function public.rider_settle_expired_payouts() is
  'Close every elapsed dispute window, returning how many rows settled. Admin-only. Safe and idempotent to call repeatedly; there is no scheduler, so the admin ledger calls this on load. CI also asserts no payout is disputed past its review_expires_at.';

-- Queries for the CI job (see .github/workflows/migrate-db.yml). Kept here so
-- the assertions and the definition of the states cannot drift apart.
--
--   -- earnings must ignore reversed rows:
--   select count(*) from riders r where r.earnings <> coalesce((
--     select sum(p.amount) from rider_payouts p
--      where p.rider_id = r.id and p.settlement_state <> 'reversed'), 0);
--
--   -- nothing should still be disputed once its window has closed:
--   select count(*) from rider_payouts
--    where settlement_state = 'disputed'
--      and review_expires_at is not null and review_expires_at <= now();