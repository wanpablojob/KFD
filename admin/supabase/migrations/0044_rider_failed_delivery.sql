-- Phase 4, item 1: a rider who cannot complete a delivery has nowhere to
-- record it. rider_mark_delivered only knows success, so a rider whose customer
-- is unreachable, has cancelled, or is not at the address is stuck holding the
-- job with the only available action being a lie ("delivered").
--
-- This adds the failure leg. Reporting a failed delivery:
--
--   * releases the order back to the dispatch pool (rider_id null, status back
--     to 'confirmed', which is what admin_dispatch_order looks for),
--   * clears rider_payout, because the fee was frozen for the rider who just
--     walked away and must be re-frozen by whoever claims it next,
--   * records who failed it, when, and why, on the order itself.
--
-- No ledger row and no riders.deliveries/earnings change: nothing was
-- delivered, so nothing is earned. That is the whole point of separating this
-- from markDelivered.
--
-- Ownership and status guards mirror rider_mark_delivered exactly, including
-- the NULL-safe `is distinct from` and reading the order's rider into its own
-- variable rather than overwriting the caller's id. An archived rider is
-- blocked here (unlike reading your own list) because failing a job is an
-- action taken on the platform's behalf, not just reading your own work.
--
-- The body never writes a bare `order_id`, `reference` or `status`: those are
-- OUT parameters and also column names, and that collision (42702) is what
-- made claim_order and admin_dispatch_order unrunnable in Phase 1.

alter table orders
  add column if not exists delivery_failed_reason text,
  add column if not exists delivery_failed_at timestamptz,
  add column if not exists delivery_failed_by text;

comment on column orders.delivery_failed_reason is
  'Why the assigned rider could not complete this delivery, as reported in the app.';
comment on column orders.delivery_failed_at is
  'When a rider reported this delivery as failed.';
comment on column orders.delivery_failed_by is
  'riders.id of the rider who reported the failure. Kept after the order is reassigned, as the accountability record.';

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
  select r.id into v_rider_id
    from riders r
   where r.user_id = auth.uid()
     and r.archived_at is null;

  if v_rider_id is null then
    raise exception 'Your account is not linked to an active rider.'
      using errcode = '42501';
  end if;

  select o.status, o.rider_id
    into v_status, v_order_rider_id
    from orders o
   where o.id = p_order_id;

  if v_status is null then
    raise exception 'No order with id %.', p_order_id;
  end if;

  if v_order_rider_id is distinct from v_rider_id then
    raise exception 'That order is not assigned to you.'
      using errcode = '42501';
  end if;

  -- Same states rider_mark_delivered accepts. A rider cannot fail an order that
  -- was never theirs to run, or one already delivered/cancelled.
  if v_status not in ('out_for_delivery', 'confirmed', 'preparing') then
    raise exception 'That order cannot be failed from its current state (%).', v_status;
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Say why the delivery could not be completed.'
      using errcode = '22023';
  end if;

  update orders
     set rider_id = null,
         rider = null,
         -- The fee belonged to the rider who failed it. Leaving it set would
         -- advertise a payout to whoever claims the order next.
         rider_payout = null,
         status = 'confirmed',
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

comment on function public.rider_report_failed_delivery(text, text) is
  'Reports the calling rider''s assigned order as undeliverable, records why, and returns it to the dispatch pool. Admin-only reassignment follows. Riders only, and only their own active job. Earns nothing.';

revoke all on function public.rider_report_failed_delivery(text, text) from public;
revoke all on function public.rider_report_failed_delivery(text, text) from anon;
grant execute on function public.rider_report_failed_delivery(text, text) to authenticated;
