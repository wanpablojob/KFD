-- --------------------------------------------------------------------------
-- Cursor-based pagination for rider assigned orders
--
-- Riders need to page through their assigned orders without loading all at once.
-- This RPC returns a page of orders with a cursor for the next page.
-- Cursor is the placed_at timestamp of the last item (stable, monotonically decreasing).
-- --------------------------------------------------------------------------

create or replace function public.fetch_rider_orders_page(
  p_cursor timestamptz default null,
  p_limit int default 20
)
returns table (
  id text,
  reference text,
  customer text,
  restaurant text,
  items jsonb,
  total numeric,
  status order_status,
  payment payment_method,
  placed_at timestamptz,
  next_cursor timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rider_id text;
  v_rider_name text;
begin
  -- Verify caller is a rider and get their rider_id
  select r.id, r.name
    into v_rider_id, v_rider_name
    from riders r
   where r.user_id = auth.uid();

  if v_rider_id is null then
    raise exception 'Your account is not linked to a rider.'
      using errcode = '42501';
  end if;

  -- Return orders assigned to this rider, ordered by placed_at DESC
  -- Cursor is the placed_at of the last item in the previous page
  return query
    select
      o.id,
      o.reference,
      o.customer,
      o.restaurant,
      o.items,
      o.total,
      o.status,
      o.payment,
      o.placed_at,
      case when count(*) over () > p_limit then o.placed_at else null end as next_cursor
    from orders o
   where o.rider_id = v_rider_id
     and (p_cursor is null or o.placed_at < p_cursor)
   order by o.placed_at desc
   limit p_limit;
end;
$$;

comment on function public.fetch_rider_orders_page(timestamptz, int)
  is 'Cursor-paginated orders for the calling rider. Cursor is the placed_at of the last item in the previous page (exclusive). Returns next_cursor when more pages exist.';

revoke all on function public.fetch_rider_orders_page(timestamptz, int) from public;
revoke all on function public.fetch_rider_orders_page(timestamptz, int) from anon;
grant execute on function public.fetch_rider_orders_page(timestamptz, int) to authenticated;