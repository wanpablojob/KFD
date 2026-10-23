-- --------------------------------------------------------------------------
-- 0134: a payout can be marked as paid
--
-- The ledger said what each delivery earned and whether its 24-hour review
-- had closed, but nothing said whether the rider had actually been paid. The
-- money goes out by GCash or cash, outside the system, so the admin records
-- it here: everything the rider is owed, marked paid in one go, with the
-- method and, for GCash, the reference number. The rider sees what is still
-- owed and when they were last paid.
--
-- Owed means settled (the review window closed with no dispute) and not yet
-- paid. A payout still in review, disputed or reversed is not paid out.
-- --------------------------------------------------------------------------

alter table public.rider_payouts
  add column if not exists paid_at timestamptz,
  add column if not exists paid_method text check (paid_method in ('gcash', 'cash')),
  add column if not exists paid_reference text,
  add column if not exists paid_by uuid references auth.users (id) on delete set null;

create index if not exists rider_payouts_paid_by_idx on public.rider_payouts (paid_by);
create index if not exists rider_payouts_unpaid_idx
  on public.rider_payouts (rider_id) where paid_at is null;

comment on column public.rider_payouts.paid_at is
  'When an admin recorded this payout as paid to the rider (0134). Null while owed.';


-- The money position of one rider's ledger, shared by the admin and rider reads.
create or replace function public.payout_position(p_rider_id text)
returns table (
  owed numeric,
  owed_count integer,
  in_review numeric,
  in_review_count integer,
  paid numeric,
  last_paid_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(amount) filter (where settlement_state = 'settled' and paid_at is null), 0),
    (count(*) filter (where settlement_state = 'settled' and paid_at is null))::int,
    coalesce(sum(amount) filter (where settlement_state in ('pending_review', 'disputed') and paid_at is null), 0),
    (count(*) filter (where settlement_state in ('pending_review', 'disputed') and paid_at is null))::int,
    coalesce(sum(amount) filter (where paid_at is not null), 0),
    max(paid_at)
  from rider_payouts
  where rider_id = p_rider_id;
$$;

revoke all on function public.payout_position(text) from public, anon, authenticated;


create or replace function public.admin_rider_payout_position(p_rider_id text)
returns table (
  owed numeric,
  owed_count integer,
  in_review numeric,
  in_review_count integer,
  paid numeric,
  last_paid_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query select * from payout_position(p_rider_id);
end;
$$;

comment on function public.admin_rider_payout_position(text)
  is 'What one rider is owed, what is still in review, and what has been paid (0134). Admins only.';
revoke all on function public.admin_rider_payout_position(text) from public, anon;
grant execute on function public.admin_rider_payout_position(text) to authenticated;


create or replace function public.rider_payout_position()
returns table (
  owed numeric,
  owed_count integer,
  in_review numeric,
  in_review_count integer,
  paid numeric,
  last_paid_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rider text := public.current_rider_id();
begin
  if v_rider is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;
  return query select * from payout_position(v_rider);
end;
$$;

comment on function public.rider_payout_position()
  is 'The calling rider''s own owed, in-review and paid totals (0134).';
revoke all on function public.rider_payout_position() from public, anon;
grant execute on function public.rider_payout_position() to authenticated;


create or replace function public.admin_mark_payouts_paid(
  p_rider_id text,
  p_method text,
  p_reference text default null
)
returns table (paid_count integer, paid_total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
  v_count integer;
  v_total numeric;
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if p_method is null or p_method not in ('gcash', 'cash') then
    raise exception 'Choose GCash or cash.' using errcode = '22023';
  end if;
  if p_method = 'gcash' and v_reference is null then
    raise exception 'Enter the GCash reference number.' using errcode = '22023';
  end if;

  with paid as (
    update rider_payouts
       set paid_at = now(),
           paid_method = p_method,
           paid_reference = v_reference,
           paid_by = auth.uid()
     where rider_id = p_rider_id
       and settlement_state = 'settled'
       and paid_at is null
    returning amount
  )
  select count(*)::int, coalesce(sum(amount), 0) into v_count, v_total from paid;

  if v_count = 0 then
    raise exception 'Nothing is owed to this rider right now.' using errcode = 'P0001';
  end if;

  perform public.audit_rider_event(
    p_rider_id,
    'rider.payouts_paid',
    jsonb_build_object('count', v_count, 'total', v_total, 'method', p_method, 'reference', v_reference)
  );

  return query select v_count, v_total;
end;
$$;

comment on function public.admin_mark_payouts_paid(text, text, text)
  is 'Records everything a rider is owed (settled, unpaid) as paid by GCash or cash, with the reference (0134). Admins only.';
revoke all on function public.admin_mark_payouts_paid(text, text, text) from public, anon;
grant execute on function public.admin_mark_payouts_paid(text, text, text) to authenticated;
