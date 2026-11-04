-- --------------------------------------------------------------------------
-- 0144: an order is picked up before it is delivered
--
-- rider_mark_delivered accepted an order still at the shop (confirmed or
-- preparing), so the rider app offered "Mark delivered" the moment a rider
-- accepted, and an order could be closed without the food ever leaving the
-- kitchen: the customer's tracker jumped from "Being prepared" to
-- "Delivered" and skipped "On the way".
--
-- Now the rider marks it picked up first (rider_mark_picked_up, which moves it
-- to out_for_delivery), and only then delivered. A trip already works this
-- way (0095). "Can't deliver" (rider_report_failed_delivery) is unchanged: a
-- rider can still hand back an order the shop cannot make.
--
-- Rebuilt from its live definition (0092) with only the status guard changed.
-- --------------------------------------------------------------------------

create or replace function public.rider_mark_delivered(p_order_id text, p_proof_path text, p_cash_collected numeric DEFAULT NULL::numeric, p_gcash_reference text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rider_id text;
  v_order_rider_id text;
  v_status order_status;
  v_payout numeric;
  v_total numeric;
  v_payment payment_method;
  v_fee_agreed boolean;
  v_variance numeric;
  v_proof text := nullif(btrim(coalesce(p_proof_path, '')), '');
  v_gcash text := nullif(btrim(coalesce(p_gcash_reference, '')), '');
  v_cash numeric;
  v_delivery_id text;
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
  select o.status, o.rider_id, o.rider_payout, o.total, o.payment, o.fee_agreed_in_person, o.delivery_id
    into v_status, v_order_rider_id, v_payout, v_total, v_payment, v_fee_agreed, v_delivery_id
    from orders o
   where o.id = p_order_id;

  if v_status is null then
    raise exception 'No order with id %.', p_order_id;
  end if;

  if v_order_rider_id is distinct from v_rider_id then
    raise exception 'That order is not assigned to you.' using errcode = '42501';
  end if;

  -- A part of a trip is delivered with the trip: one photo, one cash
  -- collection, one set of payouts (0090).
  if v_delivery_id is not null then
    raise exception 'This order is part of a delivery. Complete the delivery instead.'
      using errcode = '22023';
  end if;

  -- Picked up first (0144): an order the rider never collected cannot be
  -- handed over. Still confirmed or preparing means the food is at the shop.
  if v_status in ('confirmed', 'preparing') then
    raise exception 'Mark the order picked up before completing the delivery.'
      using errcode = '22023';
  end if;

  if v_status <> 'out_for_delivery' then
    raise exception 'That order cannot be marked delivered from its current state (%).', v_status;
  end if;

  -- 0079: proof is the point of this function, so it is required rather than
  -- merely recorded. The photo is uploaded by the client first and the object
  -- must already exist: without that check a rider could name any path and
  -- close a delivery with a file that is not there.
  if v_proof is null then
    raise exception 'Take a photo of the delivery before completing it.'
      using errcode = '22023';
  end if;

  -- The path must be THIS rider's photo of THIS order (the client writes
  -- <rider>/<order>.<ext>). Existence alone would accept any proof in the
  -- bucket, including another rider's or an older delivery's.
  if v_proof not in (
    v_rider_id || '/' || p_order_id || '.jpg',
    v_rider_id || '/' || p_order_id || '.png',
    v_rider_id || '/' || p_order_id || '.webp'
  ) then
    raise exception 'That delivery photo does not belong to this order. Take it again.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'delivery-proofs'
       and o.name = v_proof
  ) then
    raise exception 'That delivery photo was not found. Upload it again.'
      using errcode = 'P0001';
  end if;

  -- Cash must be stated on a cash order. The amount is the rider's assertion
  -- and may disagree with the total; that is recorded, not refused. Refusing to
  -- close would strand a delivery that has already physically happened.
  v_cash := round(coalesce(p_cash_collected, 0), 2);

  if v_payment = 'cash' and p_cash_collected is null then
    raise exception 'Enter the cash you collected.' using errcode = '22023';
  end if;

  if v_cash < 0 then
    raise exception 'Cash collected cannot be negative.' using errcode = '22023';
  end if;

  -- The status precondition lives in the UPDATE, not only in the IF above. Two
  -- concurrent taps both read 'confirmed', both passed the IF, and both ran the
  -- increments below. With the guard here the loser updates zero rows and is
  -- told why, instead of double-counting.
  update orders
     set status = 'delivered',
         delivered_at = now(),
         delivery_photo_path = v_proof
   where id = p_order_id
     -- Cast required. `array['a','b']` is text[], and orders.status is the
     -- order_status enum, so without this Postgres reports
     -- \"operator does not exist: order_status = text\" (42883) and the whole
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
  insert into rider_payouts (
    rider_id, order_id, amount,
    gcash_reference, gcash_reference_missing
  )
  values (
    v_rider_id, p_order_id, v_payout,
    v_gcash,
    (v_payment = 'e_wallet' and v_gcash is null)
  )
  on conflict (order_id) do nothing;

  -- The other direction of the same money. Only a cash order creates one: a
  -- GCash payment went from the customer to the rider's own account and the
  -- platform never held it, so there is nothing to hand back.
  if v_payment = 'cash' then
    v_variance := round(v_cash - v_total, 2);
    -- Fee agreed at the door (0080): cash above the total IS that fee. Only a
    -- shortfall against the food and service fee is a real variance.
    if v_fee_agreed then
      v_variance := least(v_variance, 0);
    end if;

    insert into rider_cash_collections (
      rider_id, order_id, amount_expected, amount_collected, variance
    )
    values (
      v_rider_id, p_order_id, round(v_total, 2), v_cash, v_variance
    )
    on conflict (order_id) do nothing;
  end if;

  -- RECOMPUTE, do not increment. riders.deliveries and riders.earnings are
  -- denormalised copies of the ledger; adding to them meant any later deletion
  -- (on delete cascade from orders) left them permanently wrong with nothing to
  -- reconcile. Recomputing is idempotent, so it is also immune to the double-tap
  -- race above. The shared helper counts a trip once (0090).
  perform public.refresh_rider_totals(v_rider_id);
end;
$function$;
