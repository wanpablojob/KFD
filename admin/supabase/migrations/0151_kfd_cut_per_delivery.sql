-- --------------------------------------------------------------------------
-- 0151: the rider owes KFD 20.00 per delivery, not every peso of the fees
--
-- The fees on a delivery (45.00 delivery + 5.00 service) split three ways:
--   * 25.00 the rider keeps as their pay,
--   * 20.00 the rider hands to KFD,
--   *  5.00 the service fee, the developer's royalty.
-- The food was already paid to the shop at pickup (0147).
--
-- Until now "on hand" was everything the rider collected less the food less
-- what was handed in, so the admin asked for all 50.00. It is now 20.00 per
-- cash delivery (an order or a whole trip) less what was handed in, in ONE
-- function that the rider's screen, the admin roster, the handover cap and the
-- close-account check all read, so they cannot disagree. Each is rebuilt from
-- its live definition with only that line changed.
--
-- admin_rider_cash_orders() lists the deliveries behind each rider's balance,
-- newest first, so the admin can see what the 20.00s are for.
-- --------------------------------------------------------------------------

-- The one definition of KFD's share of a delivery.
create or replace function public.kfd_cut_per_delivery()
returns numeric
language sql
immutable
set search_path = public
as $$ select 20.00::numeric; $$;

comment on function public.kfd_cut_per_delivery() is
  'What a rider hands KFD for each cash delivery, in pesos (0151).';
revoke all on function public.kfd_cut_per_delivery() from public, anon, authenticated;

-- What a rider owes KFD right now. Internal: only the functions below call it.
create or replace function public.rider_cash_owed(p_rider_id text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select public.kfd_cut_per_delivery() * (
           (select count(*) from rider_cash_collections where rider_id = p_rider_id)
         + (select count(*) from delivery_cash_collections where rider_id = p_rider_id))
       - coalesce((select sum(amount) from rider_cash_handovers where rider_id = p_rider_id), 0);
$$;

comment on function public.rider_cash_owed(text) is
  'KFD''s 20.00 per cash delivery, less what the rider handed in (0151). Internal.';
revoke all on function public.rider_cash_owed(text) from public, anon, authenticated;

create or replace function public.rider_cash_position()
 RETURNS TABLE(collected numeric, handed_over numeric, on_hand numeric, flagged numeric, deliveries bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- KFD's 20.00 per cash delivery, less what was handed in (0151).
    public.rider_cash_owed(v_rider_id),
    coalesce(c.flagged, 0),
    coalesce(c.deliveries, 0)
  from (select 0::numeric as total, 0::numeric as flagged, 0::bigint as deliveries) z
  left join lateral (
    -- abs: a short collection is the dispute an operator most needs to see.
    -- sum() over bigint returns numeric, so the count is cast back: the
    -- function returns bigint.
    select sum(x.total) as total,
           sum(x.flagged) as flagged,
           sum(x.deliveries)::bigint as deliveries
      from (
        select sum(y.amount_collected) as total,
               sum(abs(y.variance)) as flagged,
               count(*)::bigint as deliveries
          from rider_cash_collections y
         where y.rider_id = v_rider_id
        union all
        select sum(w.amount_collected),
               sum(abs(w.variance)),
               count(*)::bigint
          from delivery_cash_collections w
         where w.rider_id = v_rider_id
      ) x
  ) c on true
  left join lateral (
    select sum(y.amount) as total
      from rider_cash_handovers y
     where y.rider_id = v_rider_id
  ) h on true;
end;
$function$;


create or replace function public.admin_rider_cash()
 RETURNS TABLE(rider_id text, rider_name text, collected numeric, handed_over numeric, on_hand numeric, flagged numeric, deliveries bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         -- KFD's 20.00 per cash delivery, less what was handed in (0151).
         public.rider_cash_owed(r.id),
         coalesce(c.flagged, 0),
         coalesce(c.deliveries, 0)
    from riders r
    left join lateral (
      select sum(x.total) as total,
             sum(x.flagged) as flagged,
             sum(x.deliveries)::bigint as deliveries
        from (
          select sum(y.amount_collected) as total,
                 sum(abs(y.variance)) as flagged,
                 count(*)::bigint as deliveries
            from rider_cash_collections y
           where y.rider_id = r.id
          union all
          select sum(w.amount_collected),
                 sum(abs(w.variance)),
                 count(*)::bigint
            from delivery_cash_collections w
           where w.rider_id = r.id
        ) x
    ) c on true
    left join lateral (
      select sum(y.amount) as total
        from rider_cash_handovers y
       where y.rider_id = r.id
    ) h on true
   where r.archived_at is null
   order by r.name;
end;
$function$;


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
  -- What the rider owes KFD, the same figure the roster shows (0151).
  v_on_hand := public.rider_cash_owed(p_rider_id);

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


create or replace function public.admin_close_rider_account(p_rider_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider riders%rowtype;
  v_on_hand numeric;
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  select * into v_rider from riders where id = p_rider_id for update;
  if not found then
    raise exception 'No rider with that id.' using errcode = 'P0001';
  end if;
  if v_rider.deletion_requested_at is null then
    raise exception 'This rider has not asked for their account to be deleted.' using errcode = 'P0001';
  end if;

  if exists (
       select 1 from orders
        where rider_id = p_rider_id
          and status in ('confirmed', 'preparing', 'out_for_delivery'))
     or exists (
       select 1 from deliveries
        where rider_id = p_rider_id
          and status in ('confirmed', 'preparing', 'out_for_delivery')) then
    raise exception 'This rider still has a delivery in progress.' using errcode = 'P0001';
  end if;

  -- Same balance as admin_rider_cash (0151).
  v_on_hand := public.rider_cash_owed(p_rider_id);
  if v_on_hand > 0 then
    raise exception 'Record the cash handover first (% on hand).', to_char(v_on_hand, 'FM999999990.00')
      using errcode = 'P0001';
  end if;

  if exists (select 1 from rider_payouts where rider_id = p_rider_id and settlement_state = 'disputed') then
    raise exception 'Resolve this rider''s disputed payouts first.' using errcode = 'P0001';
  end if;

  -- Detach the login BEFORE deleting it: riders.user_id cascades on delete
  -- (0018), which would take the rider row and its payout ledger with it.
  update riders
     set user_id = null,
         name = 'Deleted rider',
         -- email is not null and unique; .invalid can never receive mail.
         email = 'deleted-' || id || '@deleted.invalid',
         phone = null,
         gcash_qr_url = null,
         gcash_name = null,
         status = 'offline',
         archived_at = coalesce(archived_at, now())
   where id = p_rider_id;

  perform public.audit_rider_event(p_rider_id, 'rider.account_closed', null);

  -- Cascades app_users, push_tokens, notifications and the rider application.
  if v_rider.user_id is not null then
    delete from auth.users where id = v_rider.user_id;
  end if;
end;
$$;


-- The deliveries behind each rider's balance, newest first: as many as the
-- balance covers (a handover pays off the oldest first).
create or replace function public.admin_rider_cash_orders()
returns table (
  rider_id text,
  rider_name text,
  reference text,
  collected_at timestamptz,
  amount numeric
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

  return query
    with owed as (
      select r.id, r.name,
             ceil(public.rider_cash_owed(r.id) / public.kfd_cut_per_delivery())::int as n
        from riders r
       where r.archived_at is null
    ),
    done as (
      select y.rider_id, o.reference, y.collected_at
        from rider_cash_collections y
        join orders o on o.id = y.order_id
      union all
      select w.rider_id, d.reference, w.collected_at
        from delivery_cash_collections w
        join deliveries d on d.id = w.delivery_id
    ),
    ranked as (
      select d.*, row_number() over (partition by d.rider_id order by d.collected_at desc) as rn
        from done d
    )
    select ow.id, ow.name, k.reference, k.collected_at, public.kfd_cut_per_delivery()
      from owed ow
      join ranked k on k.rider_id = ow.id and k.rn <= ow.n
     where ow.n > 0
     order by ow.name, k.collected_at desc;
end;
$$;

comment on function public.admin_rider_cash_orders() is
  'The deliveries behind each rider''s unpaid balance, 20.00 each, newest first (0151). Admins only.';
revoke all on function public.admin_rider_cash_orders() from public, anon;
grant execute on function public.admin_rider_cash_orders() to authenticated;

-- 0147's helper is no longer read by anything.
drop function if exists public.rider_cash_kept(text);
