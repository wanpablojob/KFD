-- --------------------------------------------------------------------------
-- FK: orders.rider_id -> riders.id
--
-- Currently orders.rider is a free-text name (legacy from 0001). This migration
-- adds a proper UUID FK column, backfills it from the existing rider name
-- matches, and leaves the free-text column for display/history.
--
-- Why not drop the free-text column:
--   * 0010 archives riders without touching orders.rider (free-text survives)
--   * Historical orders keep the name even if the rider is archived/reassigned
--   * The new rider_id is for RLS and integrity; the text is for receipts
-- --------------------------------------------------------------------------

-- 1. Add the new column (nullable for backfill)
--
-- text, not uuid: riders.id is `text primary key` (0001), so a uuid column
-- cannot carry a foreign key to it at all. Postgres rejects the constraint with
-- 42804 "key columns are of incompatible types: uuid and text". Matched to the
-- referenced type, which is the only correct choice here.
alter table orders
  add column if not exists rider_id text
    references riders (id)
    on delete set null;

create index if not exists orders_rider_id_idx on orders (rider_id);

comment on column orders.rider_id is
  'FK to riders.id for RLS and assignment integrity. The free-text orders.rider is retained for display/history.';

-- 2. Backfill from existing rider name matches
do $$
declare
  v_total integer;
  v_matched integer;
  v_ambiguous integer;
  v_still_null integer;
begin
  select count(*) into v_total from orders where rider is not null and rider <> 'Unassigned';

  -- Match on rider name, case-insensitive. Skip ambiguous names.
  with rider_map as (
    select
      lower(btrim(name)) as name,
      (array_agg(id order by id))[1] as rider_id,
      count(*) as holders
    from riders
    where archived_at is null
    group by 1
  ),
  updated as (
    update orders o
       set rider_id = m.rider_id
      from rider_map m
     where m.holders = 1
       and o.rider_id is null
       and o.rider is not null
       and o.rider <> 'Unassigned'
       and lower(btrim(o.rider)) = m.name
    returning 1
  )
  select count(*) into v_matched from updated;

  with rider_map as (
    select lower(btrim(name)) as name, count(*) as holders
    from riders
    where archived_at is null
    group by 1
  )
  select count(*)
    into v_ambiguous
    from orders o
    join rider_map m on m.name = lower(btrim(o.rider))
   where m.holders > 1;

  select count(*) into v_still_null
    from orders
   where rider_id is null
     and rider is not null
     and rider <> 'Unassigned';

  raise notice
    'rider_id backfill: % of % orders matched; % left null; % skipped as ambiguous',
    v_matched, v_total, v_still_null, v_ambiguous;
end;
$$;

-- 3. RLS: a rider reads orders assigned via rider_id (more reliable than name)
drop policy if exists "riders read assigned orders" on orders;
create policy "riders read assigned orders"
  on orders for select
  to authenticated
  using (
    rider_id is not null
    and rider_id = (
      select id from riders where user_id = auth.uid() limit 1
    )
  );

-- 4. Update rider_mark_delivered to also check rider_id
create or replace function public.rider_mark_delivered(p_order_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider_id text;
  v_order_rider_id text;
  v_status order_status;
begin
  select r.id into v_rider_id
    from riders r
   where r.user_id = auth.uid();

  if v_rider_id is null then
    raise exception 'Your account is not linked to a rider.'
      using errcode = '42501';
  end if;

  -- Read the order's assignee into its OWN variable. This previously selected
  -- into v_rider_id, overwriting the caller's id with the order's, so the
  -- ownership check below compared the order's rider against itself and could
  -- never fail -- any authenticated rider could mark any order delivered.
  select o.status, o.rider_id into v_status, v_order_rider_id
    from orders o
   where o.id = p_order_id;

  if v_status is null then
    raise exception 'No order with id %.', p_order_id;
  end if;

  if v_order_rider_id is distinct from v_rider_id then
    raise exception 'That order is not assigned to you.'
      using errcode = '42501';
  end if;

  if v_status not in ('out_for_delivery', 'confirmed', 'preparing') then
    raise exception 'That order cannot be marked delivered from its current state (%).', v_status;
  end if;

  update orders
     set status = 'delivered'
   where id = p_order_id;

  update riders
     set deliveries = deliveries + 1
   where user_id = auth.uid();
end;
$$;

comment on function public.rider_mark_delivered(text)
  is 'Mark one of your assigned orders delivered and bump your delivery count. Rider only.';

-- Grants unchanged (already granted to authenticated in 0018)