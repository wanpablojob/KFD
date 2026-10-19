-- --------------------------------------------------------------------------
-- Rider money and trust: proof of delivery, cash collection, GCash reference
--
-- Marking a delivery complete was one unconfirmed tap. It paid the rider from a
-- ledger, but recorded nothing about what the rider actually did: no evidence
-- the food arrived, no record of cash taken, no way to settle up.
--
-- Four gaps, closed together because they share one function:
--
-- 1. NO PROOF OF DELIVERY. rider_mark_delivered(p_order_id) took no evidence,
--    so "delivered" was an assertion by the rider with nothing behind it. A
--    customer disputing never got as far as an argument. Now a photo is
--    mandatory: p_proof_path is required, the object must already exist in the
--    delivery-proofs bucket, and orders keeps the path plus delivered_at.
--
-- 2. NO CASH RECORD. On a cash-on-delivery order the rider takes real money and
--    nothing recorded it. rider_cash_collections is the mirror of rider_payouts
--    for the other direction: one row per completed cash delivery, holding both
--    what the order was worth and what the rider says they took.
--
--    A variance does NOT block. The food has physically changed hands and the
--    cash is in the rider's pocket; refusing the completion would strand a real,
--    finished delivery to protect a number. So the mismatch is recorded in full
--    and left for an operator, which is also the only version of this that can
--    be reconstructed later.
--
-- 3. NO CASH ON HAND. Nothing told a rider what they were carrying, which is
--    the figure that decides whether they need to bank today. rider_cash_position()
--    is collections minus hand-overs, and hand-overs are recorded by an admin in
--    admin_record_cash_handover().
--
-- 4. GCASH WAS TRUSTED BLINDLY. 0057 put the rider's own QR in front of the
--    customer and recorded nothing about whether money arrived. The rider now
--    supplies the GCash reference. It is requested but NOT required: a rider
--    standing at a door with a customer who genuinely has no reference would
--    otherwise be unable to complete a delivery that did happen. A missing
--    reference is stamped on the ledger row so an operator can see exactly
--    which e_wallet deliveries lack proof, rather than discovering it later.
--
-- ON WHY THIS IS ONE MIGRATION RATHER THAN FOUR
--
-- All four change rider_mark_delivered, which has been rebuilt five times
-- (0018, 0025, 0037, 0038, 0071) and rebuilt from the WRONG body twice, each
-- time silently deleting a money column. Every rebuild is a chance to lose
-- something. One rebuild, one reviewable diff, and the whole feature applies or
-- does not apply at all.
--
-- The body below is rebuilt from 0071 -- the LATEST definer, verified by
-- grepping the migrations rather than trusting the skill's claim that 0038 is
-- current. Per the rule that has bitten twice: run `grep -c <column>` on the
-- candidate file and compare against the live one.
--
-- Nothing is backfilled. Deliveries completed before this migration have no
-- photo and no cash record, and inventing either would be the same fiction
-- 0038 refused for payouts. orders.delivered_at is new, so the proof invariant
-- added to migrate-db.yml scopes itself to rows that went through this
-- function and cannot fail on historical rows.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- Delivery proof photos
-- --------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-proofs', 'delivery-proofs', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- No COMMENT ON here: a bucket is not a commentable object type, so
-- `comment on bucket ...` is a 42601 syntax error rather than a no-op. The
-- bucket's purpose is documented above instead.

-- Path discipline is the whole authorisation model here. The first folder is
-- always the rider id, so every policy below is one comparison and there is no
-- second column that could disagree with the path.
drop policy if exists "riders upload own delivery proof" on storage.objects;
create policy "riders upload own delivery proof"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'delivery-proofs'
    and exists (
      select 1 from public.riders r
       where r.user_id = auth.uid()
         and r.archived_at is null
         and r.suspended_at is null
         and r.id = (storage.foldername(name))[1]
    )
  );

-- A rider may read their own proofs, and an admin may read any of them to settle
-- a dispute. Customers deliberately cannot: the photo is evidence for the
-- operator, and the customer is not a party to a rider cash dispute.
drop policy if exists "read delivery proof" on storage.objects;
create policy "read delivery proof"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'delivery-proofs'
    and (
      exists (select 1 from public.riders r where r.user_id = auth.uid() and r.id = (storage.foldername(name))[1])
      or exists (
        select 1 from public.app_users a
         where a.user_id = auth.uid()
           and a.role = 'admin'
      )
    )
  );

-- No update and no delete policy on purpose: a proof, once taken, is part of the
-- money record. If it is ever wrong the remedy is an operator, not the rider.

alter table public.orders
  add column if not exists delivery_photo_path text,
  add column if not exists delivered_at timestamptz,
  -- Written by customer_place_order from 0081. Here because the cash check below
  -- reads it: on these orders the fee is settled at the door, so cash above the
  -- order total is that fee, not a variance.
  add column if not exists fee_agreed_in_person boolean not null default false;

comment on column public.orders.delivery_photo_path is
  'Object path in the delivery-proofs bucket, required from 0079. Null on every delivery completed before it.';
comment on column public.orders.delivered_at is
  'When the rider completed the delivery. Null before 0079.';

-- --------------------------------------------------------------------------
-- Cash collected, and cash handed back
-- --------------------------------------------------------------------------

create table if not exists public.rider_cash_collections (
  id bigint generated always as identity primary key,
  rider_id text not null references public.riders (id) on delete cascade,
  order_id text not null references public.orders (id) on delete cascade,
  -- What the order was worth at the moment of completion. Frozen like the
  -- payout fee: a past collection keeps the figure the rider actually took.
  amount_expected numeric(12, 2) not null,
  -- What the rider says they took. This is the number that goes on hand.
  amount_collected numeric(12, 2) not null check (amount_collected >= 0),
  -- collected - expected. Zero when the two agree. Kept as its own column
  -- rather than derived on read so the disagreement is greppable and a later
  -- change to either figure cannot quietly erase it.
  variance numeric(12, 2) not null,
  collected_at timestamptz not null default now(),
  constraint rider_cash_collections_order_unique unique (order_id)
);

create index if not exists rider_cash_collections_rider_idx
  on public.rider_cash_collections (rider_id, collected_at desc);

comment on table public.rider_cash_collections is
  'Cash a rider took from a customer on a completed cash order. One row per delivery; the mirror of rider_payouts for the rider-to-platform direction.';

alter table public.rider_cash_collections enable row level security;

-- No client privileges at all. Read through rider_cash_position(), write only
-- through rider_mark_delivered. 0039 exists because an enabled RLS policy is not
-- a privilege: anon reached PostgREST and got 200 [] rather than a refusal.
revoke all on table public.rider_cash_collections from anon, authenticated;

create table if not exists public.rider_cash_handovers (
  id bigint generated always as identity primary key,
  rider_id text not null references public.riders (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  handed_at timestamptz not null default now(),
  -- The admin who recorded it. Set null on delete so removing an account cannot
  -- orphan the money record; who authorised it is audit detail, the amount is
  -- not.
  recorded_by uuid references auth.users (id) on delete set null,
  note text
);

create index if not exists rider_cash_handovers_rider_idx
  on public.rider_cash_handovers (rider_id, handed_at desc);

comment on table public.rider_cash_handovers is
  'Cash a rider paid back to the platform. Recorded by an admin; reduces cash on hand.';

alter table public.rider_cash_handovers enable row level security;
revoke all on table public.rider_cash_handovers from anon, authenticated;

-- --------------------------------------------------------------------------
-- GCash reference on the ledger
-- --------------------------------------------------------------------------

alter table public.rider_payouts
  add column if not exists gcash_reference text,
  add column if not exists gcash_reference_missing boolean not null default false;

comment on column public.rider_payouts.gcash_reference is
  'GCash transaction reference the rider supplied for an e_wallet delivery. Null means none was given.';
comment on column public.rider_payouts.gcash_reference_missing is
  'True when the delivery was e_wallet and the rider could not supply a reference. Flagged for an operator, never blocking.';

-- --------------------------------------------------------------------------
-- rider_cash_position: what the rider is currently carrying
-- --------------------------------------------------------------------------

create or replace function public.rider_cash_position()
returns table (
  collected numeric,
  handed_over numeric,
  on_hand numeric,
  flagged numeric,
  deliveries bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rider_id text;
begin
  select r.id into v_rider_id
    from riders r
   where r.user_id = auth.uid()
     and r.archived_at is null
     and r.suspended_at is null;

  if v_rider_id is null then
    raise exception 'Your account is not linked to an active rider.' using errcode = '42501';
  end if;

  return query
  select
    coalesce(c.total, 0),
    coalesce(h.total, 0),
    coalesce(c.total, 0) - coalesce(h.total, 0),
    coalesce(c.flagged, 0),
    coalesce(c.deliveries, 0)
  from (select 0::numeric as total, 0::numeric as flagged, 0::bigint as deliveries) z
  left join lateral (
    -- abs: a short collection is the dispute an operator most needs to see.
    select sum(x.amount_collected) as total,
           sum(abs(x.variance)) as flagged,
           count(*) as deliveries
      from rider_cash_collections x
     where x.rider_id = v_rider_id
  ) c on true
  left join lateral (
    select sum(y.amount) as total
      from rider_cash_handovers y
     where y.rider_id = v_rider_id
  ) h on true;
end;
$$;

comment on function public.rider_cash_position()
  is 'The calling rider''s cash position: collected minus handed over, plus the running variance total an operator would need to settle a dispute.';

revoke all on function public.rider_cash_position() from public;
revoke all on function public.rider_cash_position() from anon;
grant execute on function public.rider_cash_position() to authenticated;

-- --------------------------------------------------------------------------
-- admin_record_cash_handover: an admin books cash back in
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
  -- Two separate sums: joining both tables in one query multiplies each row by
  -- the other table's row count and inflates both totals.
  v_on_hand :=
    coalesce((select sum(x.amount_collected) from rider_cash_collections x where x.rider_id = p_rider_id), 0)
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
  is 'Record cash a rider paid back. Refuses more than the rider is holding, so on_hand can never go negative.';

revoke all on function public.admin_record_cash_handover(text, numeric, text) from public;
revoke all on function public.admin_record_cash_handover(text, numeric, text) from anon, authenticated;
grant execute on function public.admin_record_cash_handover(text, numeric, text) to authenticated;

-- --------------------------------------------------------------------------
-- admin_rider_cash: every rider's position, for the admin roster
-- --------------------------------------------------------------------------

create or replace function public.admin_rider_cash()
returns table (
  rider_id text,
  rider_name text,
  collected numeric,
  handed_over numeric,
  on_hand numeric,
  flagged numeric,
  deliveries bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from app_users
     where user_id = auth.uid() and role = 'admin'
  ) then
    raise exception 'This action is for administrators only.' using errcode = '42501';
  end if;

  return query
  select r.id,
         r.name,
         coalesce(c.total, 0),
         coalesce(h.total, 0),
         coalesce(c.total, 0) - coalesce(h.total, 0),
         coalesce(c.flagged, 0),
         coalesce(c.deliveries, 0)
    from riders r
    left join lateral (
      select sum(x.amount_collected) as total,
             sum(abs(x.variance)) as flagged,
             count(*) as deliveries
        from rider_cash_collections x
       where x.rider_id = r.id
    ) c on true
    left join lateral (
      select sum(y.amount) as total
        from rider_cash_handovers y
       where y.rider_id = r.id
    ) h on true
   where r.archived_at is null
   order by r.name;
end;
$$;

comment on function public.admin_rider_cash()
  is 'Cash position for every active rider, for the admin roster.';

revoke all on function public.admin_rider_cash() from public;
revoke all on function public.admin_rider_cash() from anon;
grant execute on function public.admin_rider_cash() to authenticated;

-- --------------------------------------------------------------------------
-- rider_mark_delivered: rebuilt from 0071, plus proof, cash and GCash
-- --------------------------------------------------------------------------
--
-- The signature changes, so this is a drop and a create rather than a replace.
-- create or replace with new parameters would leave the old one-argument
-- function in place beside the new four-argument one under the same name, and
-- PostgREST would then have two candidates to choose between.
drop function if exists public.rider_mark_delivered(text);

create function public.rider_mark_delivered(
  p_order_id text,
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
  select o.status, o.rider_id, o.rider_payout, o.total, o.payment, o.fee_agreed_in_person
    into v_status, v_order_rider_id, v_payout, v_total, v_payment, v_fee_agreed
    from orders o
   where o.id = p_order_id;

  if v_status is null then
    raise exception 'No order with id %.', p_order_id;
  end if;

  if v_order_rider_id is distinct from v_rider_id then
    raise exception 'That order is not assigned to you.' using errcode = '42501';
  end if;

  if v_status not in ('out_for_delivery', 'confirmed', 'preparing') then
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
     -- "operator does not exist: order_status = text" (42883) and the whole
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
  -- race above.
  update riders r
     set deliveries = (select count(*)::int from rider_payouts p where p.rider_id = v_rider_id),
         earnings = coalesce((select sum(p.amount) from rider_payouts p where p.rider_id = v_rider_id), 0)
   where r.id = v_rider_id;
end;
$$;

comment on function public.rider_mark_delivered(text, text, numeric, text)
  is 'Complete a delivery. p_proof_path is required and must name an existing object in delivery-proofs. p_cash_collected is required on a cash order and is recorded even when it disagrees with the total; the variance is flagged rather than refused. p_gcash_reference is recorded on an e_wallet order and flagged when absent (0079).';

revoke all on function public.rider_mark_delivered(text, text, numeric, text) from public;
revoke all on function public.rider_mark_delivered(text, text, numeric, text) from anon;
grant execute on function public.rider_mark_delivered(text, text, numeric, text) to authenticated;