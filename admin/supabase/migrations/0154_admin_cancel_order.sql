-- --------------------------------------------------------------------------
-- 0154: an admin can cancel any order that is not finished
--
-- The customer can cancel only before the kitchen starts (cancel_order) and
-- the shop only up to preparing (orders_guard_client_status). An order stuck
-- after that -- no rider for hours, a kitchen that closed, a customer who
-- cannot be reached -- had no way out but the database. Admins bypass the
-- client guard, so a raw update would let them set any status at all; this
-- function is the one sanctioned path, with its own rules:
--
--   * admins only;
--   * the order must not be delivered or already cancelled;
--   * a reason is required, saved where the customer and shop see it;
--   * live rider offers for it lapse, and the rider is freed (the two-job cap
--     counts only active orders, 0148);
--   * the cancellation is recorded in the activity log.
-- --------------------------------------------------------------------------

create or replace function public.admin_cancel_order(p_order_id text, p_reason text)
returns table (order_id text, reference text, previous_status order_status)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_row orders;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'Give a reason for cancelling. The customer and the shop see it.'
      using errcode = '22023';
  end if;

  select * into v_row from orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0001';
  end if;
  if v_row.status in ('delivered', 'cancelled') then
    raise exception 'This order is already %, so it cannot be cancelled.', v_row.status
      using errcode = 'P0001';
  end if;

  update orders o
     set status = 'cancelled',
         rejection_reason = 'Cancelled by Meriendash: ' || v_reason
   where o.id = p_order_id;

  update order_offers f
     set status = 'expired'
   where f.order_id = p_order_id
     and f.status = 'offered';

  -- record_id is a uuid (0028) and an order id is text, so the id goes in detail.
  insert into audit_log (table_name, action, event, detail, actor_user_id)
  values ('orders', 'update', 'order.cancelled_by_admin',
          jsonb_build_object('order_id', v_row.id,
                             'reference', v_row.reference,
                             'from_status', v_row.status,
                             'rider_id', v_row.rider_id,
                             'reason', v_reason),
          auth.uid());

  order_id := v_row.id;
  reference := v_row.reference;
  previous_status := v_row.status;
  return next;
end;
$$;

comment on function public.admin_cancel_order(text, text) is
  'Cancel an order that is not delivered or already cancelled, with a required reason (0154). Admins only. Lapses its rider offers and records it in the activity log.';

revoke all on function public.admin_cancel_order(text, text) from public, anon;
grant execute on function public.admin_cancel_order(text, text) to authenticated;
