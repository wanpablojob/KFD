-- --------------------------------------------------------------------------
-- cancel_order: let a customer cancel their own order before the kitchen starts
--
-- Deliberately narrow. A customer may cancel only while the order is `pending`
-- (awaiting the restaurant) or `confirmed` (accepted, not yet cooking). Once it
-- is `preparing` the food is being made and a self-serve cancel is a business
-- loss the restaurant cannot recover, so the customer is told to call instead.
--
-- Ownership is checked against auth.uid() = orders.customer_user_id, read with
-- `for update` so a cancel cannot race a rider claim on the same row.
--
-- Cancelling is a business rejection, so it raises P0001, not 40001 (which
-- PostgREST treats as retryable and re-runs forever).
-- --------------------------------------------------------------------------

create function public.cancel_order(p_order_id text)
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
  v_row orders;
begin
  if auth.uid() is null then
    raise exception 'Sign in to cancel an order.' using errcode = '42501';
  end if;

  select * into v_row
    from orders o
   where o.id = p_order_id
   for update;

  if not found then
    raise exception 'Order not found.' using errcode = 'P0001';
  end if;

  if v_row.customer_user_id is distinct from auth.uid() then
    raise exception 'This is not your order.' using errcode = '42501';
  end if;

  if v_row.status not in ('pending', 'confirmed') then
    raise exception 'This order can no longer be cancelled. Call the restaurant.'
      using errcode = 'P0001';
  end if;

  update orders
     set status = 'cancelled',
         rejection_reason = 'Cancelled by customer'
   where id = p_order_id;

  return query
    select v_row.id, v_row.reference, 'cancelled'::order_status;
end;
$$;

comment on function public.cancel_order(text)
  is 'Customer-initiated cancellation, allowed only while the order is pending or confirmed and only for the order''s own customer.';

revoke all on function public.cancel_order(text) from public;
revoke all on function public.cancel_order(text) from anon;
grant execute on function public.cancel_order(text) to authenticated;
