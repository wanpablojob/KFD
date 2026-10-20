-- --------------------------------------------------------------------------
-- 0099: the trips, for the dispatcher's dashboard
-- --------------------------------------------------------------------------
--
-- A trip is one basket from several shops, and until now the only place one
-- could be seen was the "waiting for a rider" card -- which only lists the
-- trips nobody has taken yet. A dispatcher had no list of the trips in
-- flight, no way to see which shops a trip holds, who is carrying it, what
-- was collected in cash, or what the rider was paid.
--
-- Two reads for that, both admin-only:
--
--   admin_deliveries()       the trips, with their shops
--   admin_delivery_detail()  one trip in full: the shops, the payouts, the
--                             cash collected against the grand total
--
-- The payouts and the cash live in tables no client can read (the rider's
-- ledger and the money), so the detail is one definer function rather than
-- three client reads.
-- --------------------------------------------------------------------------

create or replace function public.admin_deliveries(
  p_limit integer default 100
)
returns table (
  delivery_id text,
  reference text,
  customer text,
  customer_phone text,
  delivery_address text,
  delivery_barangay text,
  status public.delivery_status,
  shops int,
  subtotal numeric,
  delivery_fee numeric,
  service_fee numeric,
  total numeric,
  rider text,
  cash_collected numeric,
  placed_at timestamp with time zone,
  delivered_at timestamp with time zone,
  restaurant_names text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'This action is for administrators only.' using errcode = '42501';
  end if;

  return query
    select d.id,
           d.reference,
           d.customer,
           d.customer_phone,
           d.delivery_address,
           d.delivery_barangay,
           d.status,
           d.shops,
           d.subtotal,
           d.delivery_fee,
           d.service_fee,
           d.total,
           coalesce(d.rider, ''),
           d.cash_collected,
           d.placed_at,
           d.delivered_at,
           coalesce(
             (select array_agg(distinct o.restaurant order by o.restaurant)
                from public.orders o
               where o.delivery_id = d.id),
             '{}'::text[]
           )
      from public.deliveries d
     order by d.placed_at desc
     limit greatest(coalesce(p_limit, 100), 1);
end;
$$;

comment on function public.admin_deliveries(integer) is
  'The trips, newest first, with the shops in each (0099). Admins only.';

revoke all on function public.admin_deliveries(integer) from public, anon, authenticated;
grant execute on function public.admin_deliveries(integer) to authenticated;

create or replace function public.admin_delivery_detail(p_delivery_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_delivery public.deliveries;
  v_result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'This action is for administrators only.' using errcode = '42501';
  end if;

  select * into v_delivery
    from public.deliveries d
   where d.id = p_delivery_id;

  if v_delivery.id is null then
    raise exception 'No delivery with that id.' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'id', v_delivery.id,
    'reference', v_delivery.reference,
    'customer', v_delivery.customer,
    'customer_phone', v_delivery.customer_phone,
    'delivery_address', v_delivery.delivery_address,
    'delivery_barangay', v_delivery.delivery_barangay,
    'status', v_delivery.status,
    'shops', v_delivery.shops,
    'subtotal', v_delivery.subtotal,
    'base_delivery_fee', v_delivery.base_delivery_fee,
    'delivery_fee', v_delivery.delivery_fee,
    'service_fee', v_delivery.service_fee,
    'total', v_delivery.total,
    'rider', v_delivery.rider,
    'rider_payout', v_delivery.rider_payout,
    'cash_collected', v_delivery.cash_collected,
    'gcash_reference', v_delivery.gcash_reference,
    'fee_agreed_in_person', v_delivery.fee_agreed_in_person,
    'placed_at', v_delivery.placed_at,
    'delivered_at', v_delivery.delivered_at,
    'delivery_photo_path', v_delivery.delivery_photo_path,
    'stops', (
      select coalesce(
               jsonb_agg(
                 jsonb_build_object(
                   'order_id', o.id,
                   'reference', o.reference,
                   'restaurant', o.restaurant,
                   'status', o.status,
                   'subtotal', o.subtotal,
                   'delivery_fee', o.delivery_fee,
                   'service_fee', o.service_fee,
                   'total', o.total,
                   'items', o.items,
                   'rider', o.rider,
                   'rider_payout', o.rider_payout,
                   'rejection_reason', o.rejection_reason,
                   'delivery_failed_reason', o.delivery_failed_reason,
                   'placed_at', o.placed_at
                 )
                 order by o.placed_at
               ),
               '[]'::jsonb
             )
        from public.orders o
       where o.delivery_id = p_delivery_id
    ),
    'payouts', (
      select coalesce(
               jsonb_agg(
                 jsonb_build_object(
                   'order_id', p.order_id,
                   'amount', p.amount,
                   'settlement_state', p.settlement_state,
                   'gcash_reference', p.gcash_reference,
                   'earned_at', p.earned_at
                 )
                 order by p.id
               ),
               '[]'::jsonb
             )
        from public.rider_payouts p
       where p.delivery_id = p_delivery_id
    ),
    'cash', (
      select coalesce(
               jsonb_agg(
                 jsonb_build_object(
                   'amount_expected', c.amount_expected,
                   'amount_collected', c.amount_collected,
                   'variance', c.variance,
                   'collected_at', c.collected_at
                 )
               ),
               '[]'::jsonb
             )
        from public.delivery_cash_collections c
       where c.delivery_id = p_delivery_id
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.admin_delivery_detail(text) is
  'One trip in full: the shops and their statuses, the fees, the rider, the payouts and the cash collected (0099). Admins only.';

revoke all on function public.admin_delivery_detail(text) from public, anon, authenticated;
grant execute on function public.admin_delivery_detail(text) to authenticated;
