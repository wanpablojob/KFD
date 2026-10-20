-- --------------------------------------------------------------------------
-- Cash handover counts the cash from trips
--
-- 0079 created admin_record_cash_handover: the admin records the cash a
-- rider paid back, and the function refuses more than the rider is holding.
-- At the time, a rider's cash came from one place -- rider_cash_collections,
-- one row per delivered order -- so the balance was a single sum.
--
-- 0092 added trips: a basket from several shops is one delivery, the
-- customer pays one bill, and that cash is recorded in
-- delivery_cash_collections. 0092 updated the two places that SHOW a balance
-- -- the rider's own summary and admin_rider_cash, the admin roster -- so
-- both added the trip money. It did not update this one, the place that
-- CHECKS a handover.
--
-- The result was a money bug with the admin caught in the middle: the roster
-- said the rider was holding 1,000.00 (300.00 of orders plus 700.00 of a
-- trip), and the handover of that same 1,000.00 was refused with "That is
-- more than the rider is holding (300.00 on hand)". The admin could not bank
-- the cash of a trip, and the only way to make the number work was to
-- under-record the handover -- which leaves the ledger wrong.
--
-- The fix is the same one line 0092 applied to the other two functions: the
-- trip collections join the balance.
--
-- Still two separate sums on purpose, and still no join between the tables:
-- joining rider_cash_collections and delivery_cash_collections in one query
-- multiplies each row by the other table's row count and inflates both
-- totals.
-- --------------------------------------------------------------------------

create or replace function public.admin_record_cash_handover(
  p_rider_id text,
  p_amount numeric,
  p_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_on_hand numeric;
  v_id bigint;
begin
  -- Re-checked in the body, not merely hidden by the nav link. Every admin RPC
  -- in this schema does this; hiding a button is not authorisation.
  if not exists (
    select 1 from app_users
     where user_id = auth.uid() and role = 'admin'
  ) then
    raise exception 'This action is for administrators only.' using errcode = '42501';
  end if;

  v_amount := round(coalesce(p_amount, 0), 2);

  if p_rider_id is null or not exists (select 1 from riders where id = p_rider_id) then
    raise exception 'No rider with that id.' using errcode = 'P0001';
  end if;

  if v_amount <= 0 then
    raise exception 'Enter how much cash was handed in.' using errcode = '22023';
  end if;

  -- Serialise handovers per rider, so two admins recording at once cannot both
  -- pass the balance check below.
  perform 1 from riders where id = p_rider_id for update;

  -- Refusing an over-payment is the whole point of the balance existing. Cash
  -- that was never collected cannot be banked, and letting it through would put
  -- on_hand negative and quietly cancel a real collection later.
  -- Three separate sums: joining the tables in one query multiplies each row by
  -- the other table's row count and inflates the totals. The trip money is
  -- here because 0092 put it there; the check and the roster must agree, or
  -- the admin is refused for handing in cash the roster says the rider holds.
  v_on_hand :=
    coalesce((select sum(x.amount_collected) from rider_cash_collections x where x.rider_id = p_rider_id), 0)
    + coalesce((select sum(w.amount_collected) from delivery_cash_collections w where w.rider_id = p_rider_id), 0)
    - coalesce((select sum(y.amount) from rider_cash_handovers y where y.rider_id = p_rider_id), 0);

  if v_amount > v_on_hand then
    raise exception 'That is more than the rider is holding (% on hand).',
      to_char(v_on_hand, 'FM999999990.00') using errcode = 'P0001';
  end if;

  insert into rider_cash_handovers (rider_id, amount, recorded_by, note)
  values (p_rider_id, v_amount, auth.uid(), v_note)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.admin_record_cash_handover(text, numeric, text)
  is 'Record cash a rider paid back. Refuses more than the rider is holding, so on_hand can never go negative. The balance counts order collections and trip collections alike.';

revoke all on function public.admin_record_cash_handover(text, numeric, text) from public;
revoke all on function public.admin_record_cash_handover(text, numeric, text) from anon, authenticated;
grant execute on function public.admin_record_cash_handover(text, numeric, text) to authenticated;
