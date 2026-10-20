-- --------------------------------------------------------------------------
-- 0095: a trip is closed only when every shop's food is with the rider
-- --------------------------------------------------------------------------
--
-- A single order is one bag: "picked up" is one tap, and closing it is
-- closing one delivery. A trip is several bags, and the rider can be at the
-- second kitchen with the first still on the counter. Closing the trip then
-- would mark that shop's food as delivered and pay the rider for a stop they
-- never made.
--
-- rider_mark_delivery_delivered now refuses until every shop's part is with
-- the rider. Rebuilt from its live definition (0092), with this one rule
-- added.
-- --------------------------------------------------------------------------

create or replace function public.rider_mark_delivery_delivered(
  p_delivery_id text,
  p_proof_path text,
  p_cash_collected numeric default null,
  p_gcash_reference text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider_id text;
  v_row public.deliveries;
  v_proof text := nullif(btrim(coalesce(p_proof_path, '')), '');
  v_gcash text := nullif(btrim(coalesce(p_gcash_reference, '')), '');
  v_cash numeric;
  v_variance numeric;
  v_stop record;
begin
  select r.id into v_rider_id
    from public.riders r
   where r.user_id = auth.uid()
     and r.archived_at is null
     and r.suspended_at is null;

  if v_rider_id is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;

  select * into v_row
    from public.deliveries d
   where d.id = p_delivery_id;

  if v_row.id is null then
    raise exception 'No trip with id %.', p_delivery_id;
  end if;

  if v_row.rider_id is distinct from v_rider_id then
    raise exception 'That trip is not assigned to you.' using errcode = '42501';
  end if;

  if v_row.status not in ('out_for_delivery', 'confirmed', 'preparing') then
    raise exception 'That trip cannot be marked delivered from its current state (%).', v_row.status;
  end if;

  -- Every shop's food has to be with the rider before the trip is closed.
  -- A single order is one bag, so "picked up" is one tap; a trip is several
  -- bags, and closing it with one still on the counter would mark a shop's
  -- food as delivered and pay the rider for a stop they never made.
  if exists (
    select 1 from public.orders o
     where o.delivery_id = p_delivery_id
       and o.status not in ('out_for_delivery', 'delivered', 'cancelled')
  ) then
    raise exception 'Collect the food from every restaurant before completing this delivery.'
      using errcode = '22023';
  end if;

  -- Proof is the point of the trip, so it is required. The photo is uploaded
  -- by the client first and the object must exist: without that check a rider
  -- could name any path and close a trip with a file that is not there.
  if v_proof is null then
    raise exception 'Take a photo of the delivery before completing it.'
      using errcode = '22023';
  end if;

  -- The path must be THIS rider's photo of THIS trip.
  if v_proof not in (
    v_rider_id || '/' || p_delivery_id || '.jpg',
    v_rider_id || '/' || p_delivery_id || '.png',
    v_rider_id || '/' || p_delivery_id || '.webp'
  ) then
    raise exception 'That delivery photo does not belong to this trip. Take it again.'
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

  -- Cash is stated on a cash trip, and it is checked against the TRIP's
  -- total: the customer pays one bill.
  v_cash := round(coalesce(p_cash_collected, 0), 2);

  if v_row.payment = 'cash' and p_cash_collected is null then
    raise exception 'Enter the cash you collected.' using errcode = '22023';
  end if;

  if v_cash < 0 then
    raise exception 'Cash collected cannot be negative.' using errcode = '22023';
  end if;

  -- The trip first, then its shops. Doing it in this order means the trip is
  -- already closed when the shops follow it out, and the trigger that keeps a
  -- trip in step with its shops cannot reopen it.
  update public.deliveries d
     set status = 'delivered',
         delivered_at = now(),
         delivery_photo_path = v_proof,
         cash_collected = v_cash,
         gcash_reference = v_gcash,
         updated_at = now()
   where d.id = p_delivery_id
     and d.status = any (array['out_for_delivery', 'confirmed', 'preparing']::public.delivery_status[]);

  if not found then
    raise exception 'That trip is no longer yours to complete.' using errcode = 'P0001';
  end if;

  -- Every shop's part is delivered with the trip. The shops keep their own
  -- order rows, and their status follows the trip.
  update public.orders o
     set status = 'delivered',
         delivered_at = now(),
         delivery_photo_path = v_proof
   where o.delivery_id = p_delivery_id
     and o.status = any (array['out_for_delivery', 'confirmed', 'preparing']::public.order_status[]);

  -- Payout: one ledger row per stop, all pointing at the trip.
  for v_stop in
    select o.id, o.rider_payout
      from public.orders o
     where o.delivery_id = p_delivery_id
       and o.rider_id = v_rider_id
       and o.status = 'delivered'
  loop
    if v_stop.rider_payout is null then
      raise exception 'This trip has no agreed fee recorded. Ask an admin to fix it.'
        using errcode = 'P0001';
    end if;

    insert into public.rider_payouts (
      rider_id, order_id, amount, delivery_id, gcash_reference, gcash_reference_missing
    )
    values (
      v_rider_id, v_stop.id, v_stop.rider_payout, p_delivery_id,
      v_gcash,
      (v_row.payment = 'e_wallet' and v_gcash is null)
    )
    on conflict (order_id) do nothing;
  end loop;

  -- The other direction of the same money: one collection for the trip.
  if v_row.payment = 'cash' then
    v_variance := round(v_cash - v_row.total, 2);
    -- Fee agreed at the door (0080): cash above the total IS that fee.
    if v_row.fee_agreed_in_person then
      v_variance := least(v_variance, 0);
    end if;

    insert into public.delivery_cash_collections (
      delivery_id, rider_id, amount_expected, amount_collected, variance
    )
    values (
      p_delivery_id, v_rider_id, round(v_row.total, 2), v_cash, v_variance
    )
    on conflict (delivery_id) do nothing;
  end if;

  perform public.refresh_rider_totals(v_rider_id);
end;
$$;
