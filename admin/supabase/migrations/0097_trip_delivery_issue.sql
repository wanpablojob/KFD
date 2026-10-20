-- --------------------------------------------------------------------------
-- 0097: a customer can report a problem with a trip
-- --------------------------------------------------------------------------
--
-- report_delivery_issue took the reference of one order and disputed that
-- order's payout. On a multi-shop order the reference the customer is
-- holding is the trip's, so the report found no order and the customer could
-- not raise a problem with a delivery that went wrong -- the one thing this
-- function exists for.
--
-- A trip is paid per stop, so a problem with the delivery is a problem with
-- every stop of it: each stop's payout is disputed, and the trip's stops come
-- back for the operator. Rebuilt from the live definition (0075), with the
-- trip branch added; the order path is untouched.
-- --------------------------------------------------------------------------

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
  v_trip public.deliveries%rowtype;
  v_is_admin boolean;
  v_disputed integer := 0;
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
    -- A trip (0092): the reference the customer was given is the trip's, not
    -- one shop's. A problem with the delivery is a problem with every stop of
    -- it -- the rider is paid per stop, so the whole trip is disputed.
    select * into v_trip
      from public.deliveries d
     where upper(replace(d.reference, '#', ''))
         = upper(replace(btrim(p_reference), '#', ''))
     limit 1;

    if not found then
      raise exception 'No order with that reference.' using errcode = 'P0002';
    end if;

    for v_payout in
      select p.* from public.rider_payouts p
        join public.orders o on o.id = p.order_id
       where o.delivery_id = v_trip.id
         and p.settlement_state <> 'reversed'
    loop
      if v_payout.review_expires_at is not null
         and v_payout.review_expires_at <= now() then
        raise exception 'The 24-hour review window for that delivery has closed.'
          using errcode = '22023';
      end if;

      if v_payout.settlement_state = 'disputed' then
        raise exception 'This delivery has already been reported and is being reviewed.'
          using errcode = '22023';
      end if;

      update public.rider_payouts
         set settlement_state = 'disputed',
             dispute_reason = left(btrim(p_reason), 500),
             disputed_at = now()
       where id = v_payout.id;

      v_disputed := v_disputed + 1;

      return query
        select o.id, o.reference, 'disputed'::public.payout_settlement_state
          from public.orders o
         where o.id = v_payout.order_id;
    end loop;

    -- Nothing was disputed: the trip has no completed stop to dispute.
    if v_disputed = 0 then
      raise exception 'That delivery has no completed delivery to dispute.' using errcode = '22023';
    end if;

    -- The trip is the whole complaint: stop here, before the single-order
    -- path below tries to dispute an order that was never found.
    return;
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
