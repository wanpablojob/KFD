-- --------------------------------------------------------------------------
-- 0114: the dispute window closes on its own, and the leftovers go
-- --------------------------------------------------------------------------
--
-- Two things.
--
-- One: a rider's payout sits in 'pending_review' for 24 hours after a
-- delivery is reported as a problem. At the end of that window it should
-- settle -- the rider gets paid, because nobody disputed it in time. It did
-- not: the window only closed when an admin happened to open the ledger, so a
-- rider whose delivery was fine could wait days for money that was already
-- theirs. 0075 says so in as many words: "there is no scheduler, so the admin
-- ledger calls this on load".
--
-- There is a scheduler now (0100), so the window closes on a timer, every
-- minute, like the re-offer job.
--
-- The rule itself moves into settle_elapsed_dispute_windows(), and the admin
-- function calls it. The admin gate stays on the admin function: the job runs
-- as the database owner, and the rule that decides what may be settled is not
-- the rule that decides who may ask for it.
--
-- Two: three functions from the first dispatch design (0035) are still there
-- and any signed-in user can call them: dispatch_riders, dispatch_unassigned_orders
-- and available_jobs. Nothing in the app calls them any more -- the offers
-- that replaced them are offer_order_to_riders (0085) and offer_delivery_to_riders
-- (0092) -- and they are security definer, so they run with the owner's
-- privileges rather than the caller's. A signed-in customer could list the
-- riders and their phone numbers, and every order with no rider, through a
-- function that no screen uses. They go.
-- --------------------------------------------------------------------------

-- The rule, on its own. Only the scheduler and the admin function call it.
create or replace function public.settle_elapsed_dispute_windows()
  returns integer
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_settled integer;
begin
  update public.rider_payouts
     set settlement_state = 'settled'
   where settlement_state = 'pending_review'
     and review_expires_at is not null
     and review_expires_at <= now();

  get diagnostics v_settled = row_count;
  return v_settled;
end;
$$;

comment on function public.settle_elapsed_dispute_windows() is
  'Close every elapsed dispute window, returning how many payouts settled. Internal: the scheduler and the admin ledger. Safe and idempotent to call repeatedly.';

revoke all on function public.settle_elapsed_dispute_windows() from public;
revoke all on function public.settle_elapsed_dispute_windows() from anon;
revoke all on function public.settle_elapsed_dispute_windows() from authenticated;
grant execute on function public.settle_elapsed_dispute_windows() to service_role;

-- The admin entry point, rebuilt from its live definition (0075) with the rule
-- moved into the function above.
create or replace function public.rider_settle_expired_payouts()
  returns integer
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only an admin can settle payouts.' using errcode = '42501';
  end if;

  return public.settle_elapsed_dispute_windows();
end;
$$;

comment on function public.rider_settle_expired_payouts()
  is 'Close every elapsed dispute window, returning how many rows settled. Admin-only. Safe and idempotent to call repeatedly; the scheduler (0114) also closes them, so the ledger usually finds nothing left to do.';

revoke all on function public.rider_settle_expired_payouts() from public;
revoke all on function public.rider_settle_expired_payouts() from anon;
grant execute on function public.rider_settle_expired_payouts() to authenticated;

-- The job scans the unsettled payouts every minute, so it gets an index of
-- its own: the rows still in review, by the moment their window closes.
create index if not exists rider_payouts_pending_review_idx
  on public.rider_payouts (review_expires_at)
  where settlement_state = 'pending_review';

-- The scheduler.
do $$
declare
  v_jobid bigint;
begin
  for v_jobid in
    select jobid from cron.job where jobname = 'settle-elapsed-payouts'
  loop
    perform cron.unschedule(v_jobid);
  end loop;
end $$;

select cron.schedule(
  'settle-elapsed-payouts',
  '* * * * *',
  $job$
    select public.settle_elapsed_dispute_windows();
  $job$
);

-- The leftovers from the first dispatch design. Nothing calls them, and they
-- hand a signed-in user the rider list and the unassigned orders.
drop function if exists public.dispatch_riders();
drop function if exists public.dispatch_unassigned_orders();
drop function if exists public.available_jobs();
